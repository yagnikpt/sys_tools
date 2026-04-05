package launcher

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"github.com/yagnikpt/sys_tools/bmark/saves"
)

// Open launches Papers with the given book, waits for it to close,
// then syncs the current page from GIO metadata back into the savepoint.
func Open(book *saves.Book, sp *saves.Saves) error {
	// Mark as last opened before launching (in case of crash)
	sp.UpdateBook(book)
	if err := sp.Save(); err != nil {
		return fmt.Errorf("failed to save pre-launch savepoint: %w", err)
	}

	fmt.Printf("opening: %s (last page: %d)\n", book.Title, book.Page)

	cmd := exec.Command("papers", "-i", strconv.Itoa(book.Page), book.Path)
	if err := cmd.Run(); err != nil {
		// Papers exited non-zero — not fatal, still try to sync page
		fmt.Printf("papers exited: %v\n", err)
	}

	// Sync page from GIO metadata written by Papers
	page, err := getGIOPage(book.Path)
	if err != nil {
		fmt.Printf("warning: could not read page from gio metadata: %v\n", err)
	} else if page > 0 {
		book.Page = page + 1
		fmt.Printf("synced page: %d\n", page+1)
	}

	sp.UpdateBook(book)
	if err := sp.Save(); err != nil {
		return fmt.Errorf("failed to save post-close savepoint: %w", err)
	}

	return nil
}

// getGIOPage reads metadata::papers::page from the file via gio.
func getGIOPage(path string) (int, error) {
	out, err := exec.Command(
		"gio", "info", "-a", "metadata::papers::page", path,
	).Output()
	if err != nil {
		return 0, fmt.Errorf("gio info failed: %w", err)
	}

	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "metadata::papers::page") {
			parts := strings.SplitN(line, ": ", 2)
			if len(parts) == 2 {
				page, err := strconv.Atoi(strings.TrimSpace(parts[1]))
				if err != nil {
					return 0, fmt.Errorf("could not parse page number: %w", err)
				}
				return page, nil
			}
		}
	}

	return 0, fmt.Errorf("metadata::papers::page not found in gio output")
}
