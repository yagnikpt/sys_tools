package config

import (
	"path/filepath"
	"strings"

	"github.com/adrg/xdg"
)

const DIR = "article_spawner"
const SAVEFILE = "config.yaml"

func DefaultFilePath() string {
	return filepath.Join(xdg.ConfigHome, DIR, SAVEFILE)
}

func resolvePath(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return DefaultFilePath()
	}
	return trimmed
}
