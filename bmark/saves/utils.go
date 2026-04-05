package saves

import (
	"crypto/md5"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/adrg/xdg"
)

const DIR = "bmark"
const SAVEFILE = "saves.toml"

func getSavesFile() string {
	return filepath.Join(xdg.DataHome, DIR, SAVEFILE)
}

func fileKey(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	return fmt.Sprintf("%x", md5.Sum([]byte(abs)))[:8]
}

func pdfTotalPages(path string) (int, error) {
	out, err := exec.Command("pdfinfo", path).Output()
	if err != nil {
		return 0, err
	}
	for line := range strings.SplitSeq(string(out), "\n") {
		match, found := strings.CutPrefix(line, "Pages:")
		if found {
			n, err := strconv.Atoi(strings.TrimSpace(match))
			return n, err
		}
	}
	return 0, fmt.Errorf("Pages not found in pdfinfo output")
}
