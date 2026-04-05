package scan

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/adrg/xdg"
)

var SCAN_DIRS = []string{filepath.Join(xdg.UserDirs.Documents, "books"), filepath.Join(xdg.UserDirs.Documents, "Books")}

func ScanLocalAvailableBooks() ([]string, error) {
	var files []string

	for _, dir := range SCAN_DIRS {
		err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				return nil
			}
			ext := strings.ToLower(filepath.Ext(path))
			if ext == ".pdf" || ext == ".epub" {
				files = append(files, path)
			}
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("walking dir %q: %w", dir, err)
		}
	}

	return files, nil
}
