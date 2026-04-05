package selector

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

// Selector abstracts fzf and rofi behind one interface.
type Selector interface {
	// Menu shows a list of items and returns the chosen one.
	Menu(items []string) (string, error)
	// Pick is Menu but with a prompt label.
	Pick(items []string) (string, error)
	// FilePick opens a file browser / fuzzy finder for file selection.
	FilePick(fileList []string) (string, error)
}

// New returns the appropriate selector based on the --rofi flag.
func New(useRofi bool, rofiConfig string) Selector {
	if useRofi {
		return &rofiSelector{config: rofiConfig}
	}
	return &fzfSelector{}
}

// ─── fzf ─────────────────────────────────────────────────────────────────────

type fzfSelector struct{}

func (f *fzfSelector) Menu(items []string) (string, error) {
	return fzfRun(items, "--prompt=bmark> ", "--height=10", "--reverse")
}

func (f *fzfSelector) Pick(items []string) (string, error) {
	return fzfRun(items, "--prompt=pick book> ", "--height=15", "--reverse")
}

func (f *fzfSelector) FilePick(fileList []string) (string, error) {
	const custom = "[ enter custom path... ]"
	items := append(fileList, custom)

	chosen, err := fzfRun(items, "--prompt=select file> ", "--height=20", "--reverse")
	if err != nil {
		return "", err
	}

	if chosen == custom {
		return fzfInput("enter file path> ")
	}
	return chosen, nil
}

// fzfInput prompts for free text input via fzf --print-query.
func fzfInput(prompt string) (string, error) {
	cmd := exec.Command("fzf", "--print-query", "--prompt="+prompt,
		"--height=5", "--reverse", "--no-info",
		"--disabled", // disable fuzzy matching, just raw input
	)
	cmd.Stdin = strings.NewReader("") // empty list, input only

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Run() // exits 1 when no match selected — that's fine with --print-query

	// --print-query always prints the query on the first line
	lines := strings.SplitN(out.String(), "\n", 2)
	path := strings.TrimSpace(lines[0])
	if path == "" {
		return "", fmt.Errorf("no path entered")
	}
	return path, nil
}

func fzfRun(items []string, flags ...string) (string, error) {
	input := strings.Join(items, "\n")
	args := append([]string{}, flags...)
	cmd := exec.Command("fzf", args...)
	cmd.Stdin = strings.NewReader(input)

	var out bytes.Buffer
	cmd.Stdout = &out

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("fzf cancelled or failed: %w", err)
	}

	return strings.TrimSpace(out.String()), nil
}

// ─── rofi ─────────────────────────────────────────────────────────────────────

type rofiSelector struct {
	config string
}

func (r *rofiSelector) Menu(items []string) (string, error) {
	return r.rofiRun(items, "bmark")
}

func (r *rofiSelector) Pick(items []string) (string, error) {
	return r.rofiRun(items, "pick book")
}

func (r *rofiSelector) FilePick(fileList []string) (string, error) {
	const custom = "[ enter custom path... ]"
	items := append(fileList, custom)

	chosen, err := r.rofiRun(items, "select file")
	if err != nil {
		return "", err
	}

	if chosen == custom {
		return r.rofiInput("enter file path")
	}
	return chosen, nil
}

// rofiInput prompts for free text input via rofi -dmenu with no list.
func (r *rofiSelector) rofiInput(prompt string) (string, error) {
	args := append(r.baseArgs(), "-p", prompt, "-i", "-l", "0")
	cmd := exec.Command("rofi", args...)
	cmd.Stdin = strings.NewReader("")

	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("rofi input cancelled: %w", err)
	}
	path := strings.TrimSpace(string(out))
	if path == "" {
		return "", fmt.Errorf("no path entered")
	}
	return path, nil
}

func (r *rofiSelector) rofiRun(items []string, prompt string) (string, error) {
	input := strings.Join(items, "\n")
	args := append(r.baseArgs(), "-p", prompt, "-i")
	cmd := exec.Command("rofi", args...)

	cmd.Stdin = strings.NewReader(input)

	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("rofi cancelled or failed: %w", err)
	}

	return strings.TrimSpace(string(out)), nil
}
