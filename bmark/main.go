package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/yagnikpt/sys_tools/bmark/launcher"
	"github.com/yagnikpt/sys_tools/bmark/saves"
	"github.com/yagnikpt/sys_tools/bmark/scan"
	"github.com/yagnikpt/sys_tools/bmark/selector"
)

func main() {
	cont := flag.Bool("continue", false, "open the last opened file")
	useRofi := flag.Bool("rofi", false, "use rofi instead of fzf")
	rofiConfig := flag.String("rofi-config", "", "path to rofi config/theme file")

	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: bmark [flags] [file]")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "flags:")
		flag.PrintDefaults()
	}

	flag.Parse()

	sel := selector.New(*useRofi, *rofiConfig)

	sp, err := saves.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error loading savepoint: %v\n", err)
		os.Exit(1)
	}

	switch {
	// bmark --continue [--rofi]
	case *cont:
		book := sp.LastOpened()
		if book == nil {
			fmt.Fprintln(os.Stderr, "no last opened file found")
			os.Exit(1)
		}
		if err := launcher.Open(book, sp); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}

	// bmark [--rofi] /path/to/file
	case flag.NArg() == 1:
		path := flag.Arg(0)
		if err := validateFile(path); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		book := sp.GetOrCreate(path)
		if err := launcher.Open(book, sp); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}

	// bmark [--rofi]
	case flag.NArg() == 0:
		action, err := sel.Menu([]string{"continue", "pick", "new"})
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		if err := handleMenuAction(action, sp, sel); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}

	default:
		flag.Usage()
		os.Exit(1)
	}
}

func handleMenuAction(action string, sp *saves.Saves, sel selector.Selector) error {
	switch action {
	case "continue":
		book := sp.LastOpened()
		if book == nil {
			return fmt.Errorf("no last opened file found")
		}
		return launcher.Open(book, sp)

	case "pick":
		books := sp.AllBooks()
		if len(books) == 0 {
			return fmt.Errorf("no saved books yet — use 'new' to add one")
		}
		labels := make([]string, len(books))
		for i, b := range books {
			labels[i] = b.DisplayLabel()
		}
		chosen, err := sel.Pick(labels)
		if err != nil {
			return err
		}
		// match chosen label back to book
		for _, b := range books {
			if b.DisplayLabel() == chosen {
				return launcher.Open(b, sp)
			}
		}
		return fmt.Errorf("could not match selection to book")

	case "new":
		fileList, err := scan.ScanLocalAvailableBooks()
		if err != nil {
			return err
		}
		path, err := sel.FilePick(fileList)
		if err != nil {
			return err
		}
		if err := validateFile(path); err != nil {
			return err
		}
		book := sp.GetOrCreate(path)
		return launcher.Open(book, sp)
	}
	return nil
}

func validateFile(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("file not found: %s", path)
	}
	if info.IsDir() {
		return fmt.Errorf("path is a directory: %s", path)
	}
	return nil
}
