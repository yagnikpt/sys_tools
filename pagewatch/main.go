package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
	"github.com/adrg/xdg"
	"github.com/antchfx/htmlquery"
	"github.com/chromedp/chromedp"
	"golang.org/x/net/html"
)

const appName = "pagewatch"

type config struct {
	Sources []source `toml:"source"`
}

type source struct {
	ID          string `toml:"id"`
	URL         string `toml:"url"`
	TargetXPath string `toml:"target_xpath"`
	Render      bool   `toml:"render"`
}

type pageRenderer struct {
	pageCtx       context.Context
	pageCancel    context.CancelFunc
	browserCancel context.CancelFunc
}

func main() {
	configPath := flag.String("config", filepath.Join(xdg.ConfigHome, appName, "sources.toml"), "path to TOML sources file")
	hashPath := flag.String("hashfile", filepath.Join(xdg.ConfigHome, appName, "hashfile"), "path to stored hashes")
	populate := flag.Bool("populate", false, "fetch all sources and update hashes without notifications")
	populateShort := flag.Bool("p", false, "alias for --populate")
	output := flag.Bool("output", false, "print fetched data by source to stdout")
	outputShort := flag.Bool("o", false, "alias for --output")
	flag.Parse()

	if err := run(*configPath, *hashPath, *populate || *populateShort, *output || *outputShort); err != nil {
		fmt.Fprintln(os.Stderr, "pagewatch:", err)
		os.Exit(1)
	}
}

func run(configPath, hashPath string, populate, printOutput bool) error {
	cfg, err := loadConfig(configPath)
	if err != nil {
		return err
	}
	if err := validate(cfg); err != nil {
		return err
	}

	previous, err := loadHashes(hashPath)
	if err != nil {
		return err
	}
	next := make(map[string]string, len(previous)+len(cfg.Sources))
	for id, hash := range previous {
		next[id] = hash
	}

	client := &http.Client{Timeout: 20 * time.Second}
	var renderer *pageRenderer
	var rendererErr error
	defer func() {
		if renderer != nil {
			renderer.close()
		}
	}()
	var failures []error
	for _, src := range cfg.Sources {
		var content string
		if src.Render {
			if renderer == nil && rendererErr == nil {
				renderer, rendererErr = newPageRenderer()
			}
			if rendererErr != nil {
				failures = append(failures, fmt.Errorf("%s: start Chromium: %w", src.ID, rendererErr))
				continue
			}
			content, err = renderedPageContent(renderer, src)
		} else {
			content, err = pageContent(client, src)
		}
		if err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", src.ID, err))
			continue
		}

		if printOutput {
			if strings.HasSuffix(content, "\n") {
				fmt.Printf("--- %s ---\n%s", src.ID, content)
			} else {
				fmt.Printf("--- %s ---\n%s\n", src.ID, content)
			}
		}

		hash := hashContent(content)
		old, exists := previous[src.ID]
		if !populate && exists && old != hash {
			if err := notify(src); err != nil {
				failures = append(failures, fmt.Errorf("notify %s: %w", src.ID, err))
				continue
			}
			fmt.Printf("changed: %s\n", src.ID)
		}
		next[src.ID] = hash
	}

	if err := saveHashes(hashPath, next); err != nil {
		return err
	}
	return errors.Join(failures...)
}

func loadConfig(path string) (config, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return config{}, fmt.Errorf("create config directory: %w", err)
		}
		const template = "# Add one [[source]] block for each page to monitor.\n# id = \"fedora-updates\"\n# url = \"https://example.com/updates\"\n# target_xpath = \"/html/body/main/section[3]/div\"\n# render = true # Optional: use headless Chrome/Chromium for JavaScript pages.\n"
		if err := os.WriteFile(path, []byte(template), 0o644); err != nil {
			return config{}, fmt.Errorf("create config %q: %w", path, err)
		}
		return config{}, fmt.Errorf("created %s; add sources and run pagewatch again", path)
	}
	if err != nil {
		return config{}, fmt.Errorf("read config %q: %w", path, err)
	}
	var cfg config
	if _, err := toml.Decode(string(data), &cfg); err != nil {
		return config{}, fmt.Errorf("decode config %q: %w", path, err)
	}
	return cfg, nil
}

func validate(cfg config) error {
	seen := make(map[string]bool, len(cfg.Sources))
	for i, src := range cfg.Sources {
		if strings.TrimSpace(src.ID) == "" || strings.ContainsAny(src.ID, "\r\n") {
			return fmt.Errorf("sources[%d].id must be a non-empty single line", i)
		}
		if seen[src.ID] {
			return fmt.Errorf("duplicate source id %q", src.ID)
		}
		seen[src.ID] = true
		if strings.TrimSpace(src.URL) == "" {
			return fmt.Errorf("sources[%d].url is required", i)
		}
		if strings.TrimSpace(src.TargetXPath) == "" {
			return fmt.Errorf("sources[%d].target_xpath is required", i)
		}
	}
	return nil
}

func pageContent(client *http.Client, src source) (string, error) {
	req, err := http.NewRequest(http.MethodGet, src.URL, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "pagewatch/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch page: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("fetch page: HTTP %s", resp.Status)
	}
	doc, err := htmlquery.Parse(resp.Body)
	if err != nil {
		return "", fmt.Errorf("parse HTML: %w", err)
	}
	return extractContent(doc, src.TargetXPath)
}

func newPageRenderer() (*pageRenderer, error) {
	browserCtx, browserCancel := chromedp.NewContext(context.Background())
	pageCtx, pageCancel := chromedp.NewContext(browserCtx)
	if _, err := chromedp.Run(pageCtx, chromedp.Navigate("about:blank")); err != nil {
		pageCancel()
		browserCancel()
		return nil, err
	}
	return &pageRenderer{pageCtx: pageCtx, pageCancel: pageCancel, browserCancel: browserCancel}, nil
}

func (r *pageRenderer) close() {
	r.pageCancel()
	r.browserCancel()
}

func renderedPageContent(renderer *pageRenderer, src source) (string, error) {
	ctx, cancel := context.WithTimeout(renderer.pageCtx, 30*time.Second)
	defer cancel()
	if _, err := chromedp.Run(ctx, chromedp.Navigate(src.URL)); err != nil {
		return "", fmt.Errorf("render page: %w", err)
	}
	if _, err := chromedp.Run(ctx, chromedp.WaitReady(src.TargetXPath)); err != nil {
		return "", fmt.Errorf("wait for target XPath: %w", err)
	}
	pageHTML, err := chromedp.Run(ctx, chromedp.OuterHTML("html"))
	if err != nil {
		return "", fmt.Errorf("read rendered HTML: %w", err)
	}
	doc, err := htmlquery.Parse(strings.NewReader(pageHTML))
	if err != nil {
		return "", fmt.Errorf("parse rendered HTML: %w", err)
	}
	return extractContent(doc, src.TargetXPath)
}

func extractContent(doc *html.Node, targetXPath string) (string, error) {
	nodes, err := htmlquery.QueryAll(doc, targetXPath)
	if err != nil {
		return "", fmt.Errorf("invalid XPath: %w", err)
	}
	if len(nodes) == 0 {
		return "", fmt.Errorf("XPath matched no elements")
	}
	var buf strings.Builder
	for _, node := range nodes {
		if err := html.Render(&buf, node); err != nil {
			return "", fmt.Errorf("serialize selected content: %w", err)
		}
	}
	return buf.String(), nil
}

func hashContent(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

func loadHashes(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read hashfile %q: %w", path, err)
	}
	var hashes map[string]string
	if err := json.Unmarshal(data, &hashes); err != nil {
		return nil, fmt.Errorf("decode hashfile %q: %w", path, err)
	}
	if hashes == nil {
		hashes = map[string]string{}
	}
	return hashes, nil
}

func saveHashes(path string, hashes map[string]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create hashfile directory: %w", err)
	}
	data, err := json.MarshalIndent(hashes, "", "  ")
	if err != nil {
		return fmt.Errorf("encode hashes: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".pagewatch-hashes-*")
	if err != nil {
		return fmt.Errorf("create temporary hashfile: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		tmp.Close()
		return fmt.Errorf("write temporary hashfile: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temporary hashfile: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("replace hashfile %q: %w", path, err)
	}
	return nil
}

func notify(src source) error {
	title := "Page changed: " + src.ID
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		script := "display notification " + appleScriptString(src.URL) + " with title " + appleScriptString(title)
		cmd = exec.Command("osascript", "-e", script)
	default:
		cmd = exec.Command("notify-send", title, src.URL)
	}
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("desktop notification: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func appleScriptString(value string) string {
	value = strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\r", " ", "\n", " ").Replace(value)
	return `"` + value + `"`
}
