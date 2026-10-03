package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/atotto/clipboard"
)

func main() {
	// Define temporary file path (only used for gnome)
	tempFile := filepath.Join(os.TempDir(), "screenshot-temp.png")

	session := os.Getenv("XDG_CURRENT_DESKTOP")

	var tesseractOutput string

	if session == "niri" || session == "umbriel" {
		// Use grim and slurp to capture screenshot without saving to file
		cmd := exec.Command("sh", "-c", "grim -g \"$(slurp -d)\" - | tesseract - stdout -c debug_file=/dev/null")
		output, err := cmd.CombinedOutput()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to capture and OCR screenshot: %v\n", err)
			os.Exit(1)
		}
		tesseractOutput = strings.TrimSpace(string(output))
	} else if session == "gnome" {
		cmd := exec.Command("gnome-screenshot", "-a", "-f", tempFile)
		err := cmd.Run()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to capture screenshot: %v\n", err)
			os.Exit(1)
		}

		// Check if temp file exists
		if _, err := os.Stat(tempFile); os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "Screenshot file not created\n")
			os.Exit(1)
		}
		defer os.Remove(tempFile) // Ensure cleanup

		// Perform OCR using tesseract command
		cmd = exec.Command("tesseract", tempFile, "stdout", "-c", "debug_file=/dev/null")
		output, err := cmd.CombinedOutput()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Tesseract OCR failed: %v\n", err)
			os.Exit(1)
		}

		tesseractOutput = strings.TrimSpace(string(output))
	} else {
		fmt.Println("Add your own support.")
		os.Exit(1)
	}

	// Check if OCR output is empty
	if tesseractOutput == "" {
		fmt.Fprintf(os.Stderr, "No text detected in screenshot\n")
		os.Exit(1)
	}

	// Copy OCR output to clipboard
	err := clipboard.WriteAll(tesseractOutput)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to copy to clipboard: %v\n", err)
		os.Exit(1)
	}
}
