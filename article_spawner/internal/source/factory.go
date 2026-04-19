package source

import (
	"fmt"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/config"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/source/api"
	_ "github.com/yagnikpt/sys_tools/article_spawner/internal/source/api/devto"
	_ "github.com/yagnikpt/sys_tools/article_spawner/internal/source/api/hackernews"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/source/rss"
)

type WeightedSource struct {
	Source Source
	Weight int
}

func BuildFromConfig(cfg config.Config) ([]WeightedSource, error) {
	built := make([]WeightedSource, 0, len(cfg.Sources))

	for _, src := range cfg.Sources {
		if !src.IsEnabled() {
			continue
		}

		switch src.Kind {
		case "rss":
			built = append(built, WeightedSource{
				Source: rss.New(src.ID, src.RSS.URL, cfg.Defaults.UserAgent, cfg.Defaults.Timeout()),
				Weight: src.Weight,
			})

		case "api":
			provider, err := api.NewProvider(src.API.Provider, src.API.Options, cfg.Defaults.Timeout(), cfg.Defaults.UserAgent)
			if err != nil {
				return nil, fmt.Errorf("build source %q: %w", src.ID, err)
			}
			built = append(built, WeightedSource{Source: api.New(src.ID, provider), Weight: src.Weight})

		default:
			return nil, fmt.Errorf("build source %q: unknown kind %q", src.ID, src.Kind)
		}
	}

	if len(built) == 0 {
		return nil, fmt.Errorf("no enabled sources to build")
	}

	return built, nil
}
