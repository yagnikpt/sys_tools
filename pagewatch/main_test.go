package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     config
		wantErr bool
	}{
		{
			name: "valid config",
			cfg: config{
				Sources: []source{
					{ID: "src-1", URL: "http://example.com", TargetXPath: "//div"},
				},
			},
			wantErr: false,
		},
		{
			name: "empty id",
			cfg: config{
				Sources: []source{
					{ID: "  ", URL: "http://example.com", TargetXPath: "//div"},
				},
			},
			wantErr: true,
		},
		{
			name: "multiline id",
			cfg: config{
				Sources: []source{
					{ID: "src\n1", URL: "http://example.com", TargetXPath: "//div"},
				},
			},
			wantErr: true,
		},
		{
			name: "duplicate id",
			cfg: config{
				Sources: []source{
					{ID: "same", URL: "http://example.com/1", TargetXPath: "//div"},
					{ID: "same", URL: "http://example.com/2", TargetXPath: "//div"},
				},
			},
			wantErr: true,
		},
		{
			name: "missing url",
			cfg: config{
				Sources: []source{
					{ID: "src-1", URL: " ", TargetXPath: "//div"},
				},
			},
			wantErr: true,
		},
		{
			name: "missing xpath",
			cfg: config{
				Sources: []source{
					{ID: "src-1", URL: "http://example.com", TargetXPath: " "},
				},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validate(tt.cfg)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validate() err = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestExtractContentAndHash(t *testing.T) {
	htmlData := `<html><body><div id="content"><p>Hello World</p></div></body></html>`
	doc, err := html.Parse(strings.NewReader(htmlData))
	if err != nil {
		t.Fatalf("parse html: %v", err)
	}

	content, err := extractContent(doc, `//div[@id="content"]`)
	if err != nil {
		t.Fatalf("extractContent error: %v", err)
	}
	expected := `<div id="content"><p>Hello World</p></div>`
	if content != expected {
		t.Fatalf("got %q, want %q", content, expected)
	}

	hash := hashContent(content)
	if hash == "" {
		t.Fatalf("expected non-empty hash")
	}

	// Non-matching xpath
	_, err = extractContent(doc, `//div[@id="nonexistent"]`)
	if err == nil {
		t.Fatalf("expected error for non-matching xpath")
	}

	// Invalid xpath syntax
	_, err = extractContent(doc, `///[[invalid`)
	if err == nil {
		t.Fatalf("expected error for invalid xpath")
	}
}

func TestSaveAndLoadHashes(t *testing.T) {
	dir := t.TempDir()
	hashFile := filepath.Join(dir, "hashes.json")

	hashes, err := loadHashes(hashFile)
	if err != nil {
		t.Fatalf("initial loadHashes err: %v", err)
	}
	if len(hashes) != 0 {
		t.Fatalf("expected empty map, got %v", hashes)
	}

	hashes["src1"] = "abc123"
	if err := saveHashes(hashFile, hashes); err != nil {
		t.Fatalf("saveHashes err: %v", err)
	}

	loaded, err := loadHashes(hashFile)
	if err != nil {
		t.Fatalf("loadHashes after save err: %v", err)
	}
	if loaded["src1"] != "abc123" {
		t.Fatalf("got %q, want %q", loaded["src1"], "abc123")
	}
}

func captureStdout(f func() error) (string, error) {
	orig := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		return "", err
	}
	os.Stdout = w

	outChan := make(chan string)
	go func() {
		var buf bytes.Buffer
		io.Copy(&buf, r)
		outChan <- buf.String()
	}()

	runErr := f()
	w.Close()
	os.Stdout = orig
	out := <-outChan
	return out, runErr
}

func TestRunOutputFlag(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintln(w, `<html><body><div id="target"><span class="val">test-val</span></div></body></html>`)
	}))
	defer server.Close()

	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "sources.toml")
	hashPath := filepath.Join(dir, "hashfile")

	cfgContent := fmt.Sprintf(`[[source]]
id = "test-src"
url = "%s"
target_xpath = "//div[@id='target']"
`, server.URL)
	if err := os.WriteFile(cfgPath, []byte(cfgContent), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	// 1. Run with output = true
	output, err := captureStdout(func() error {
		return run(cfgPath, hashPath, false, true)
	})
	if err != nil {
		t.Fatalf("run with output failed: %v", err)
	}

	wantHeader := "--- test-src ---\n"
	wantContent := `<div id="target"><span class="val">test-val</span></div>`
	if !strings.Contains(output, wantHeader) {
		t.Fatalf("output missing header %q; got: %q", wantHeader, output)
	}
	if !strings.Contains(output, wantContent) {
		t.Fatalf("output missing content %q; got: %q", wantContent, output)
	}

	// Verify that hashfile was saved
	hashes, err := loadHashes(hashPath)
	if err != nil {
		t.Fatalf("load hashes failed: %v", err)
	}
	if hashes["test-src"] == "" {
		t.Fatalf("expected test-src hash to be saved in normal execution")
	}
}
