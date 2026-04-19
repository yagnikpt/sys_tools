package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/config"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/openurl"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/source"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/spawner"
)

func main() {
	configPath := flag.String("config", "", "path to YAML config (default: XDG config path)")
	dryRun := flag.Bool("dry-run", false, "select and print article, do not open")
	printOnly := flag.Bool("print", false, "print selected article details")
	forcedSourceID := flag.String("source", "", "force a specific source id")

	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: article_spawner [flags]")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "flags:")
		flag.PrintDefaults()
	}

	flag.Parse()

	if err := run(*configPath, *dryRun, *printOnly, *forcedSourceID); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run(configPath string, dryRun bool, printOnly bool, forcedSourceID string) error {
	forcedSourceID = strings.TrimSpace(forcedSourceID)

	cfg, err := config.Load(configPath)
	if err != nil {
		return err
	}

	builtSources, err := source.BuildFromConfig(cfg)
	if err != nil {
		return err
	}

	sp, err := spawner.New(builtSources)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Defaults.Timeout())
	defer cancel()

	article, err := sp.PickRandom(ctx, cfg.Defaults.FetchLimit, forcedSourceID)
	if err != nil {
		return err
	}

	if dryRun || printOnly {
		printArticle(article)
		return nil
	}

	if err := openurl.Open(context.Background(), article.URL); err != nil {
		return err
	}

	fmt.Printf("opened [%s] %s\n", article.SourceID, article.URL)

	return nil
}

func printArticle(article model.Article) {
	fmt.Printf("source: %s\n", article.SourceID)
	fmt.Printf("title:  %s\n", article.Title)
	fmt.Printf("url:    %s\n", article.URL)
	if article.Score > 0 {
		fmt.Printf("score:  %d\n", article.Score)
	}
}
