package openurl

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

func DefaultCommand(goos string) string {
	switch goos {
	case "windows":
		return "cmd /c start"
	case "darwin":
		return "open"
	default:
		return "xdg-open"
	}
}

func DefaultCommandForRuntime() string {
	return DefaultCommand(runtime.GOOS)
}

func Open(ctx context.Context, target string) error {
	command := DefaultCommandForRuntime()

	parts := strings.Fields(command)
	if len(parts) == 0 {
		return fmt.Errorf("open command must not be empty")
	}

	args := append(parts[1:], target)
	if runtime.GOOS == "windows" && isCmdStart(parts) {
		args = append(parts[1:], "", target)
	}

	cmd := exec.CommandContext(ctx, parts[0], args...)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("run %q: %w", command, err)
	}

	return nil
}

func isCmdStart(parts []string) bool {
	if len(parts) < 3 {
		return false
	}
	return strings.EqualFold(parts[0], "cmd") && strings.EqualFold(parts[1], "/c") && strings.EqualFold(parts[2], "start")
}
