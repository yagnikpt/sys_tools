package spawner

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/source"
)

var ErrNoArticles = errors.New("no articles available")

type Spawner struct {
	rng     *rand.Rand
	sources []source.WeightedSource
}

func New(sources []source.WeightedSource) (*Spawner, error) {
	if len(sources) == 0 {
		return nil, fmt.Errorf("spawner requires at least one source")
	}

	return &Spawner{
		rng:     rand.New(rand.NewSource(time.Now().UnixNano())),
		sources: sources,
	}, nil
}

func (s *Spawner) PickRandom(ctx context.Context, fetchLimit int, forcedSourceID string) (model.Article, error) {
	if fetchLimit <= 0 {
		return model.Article{}, fmt.Errorf("fetch limit must be > 0")
	}

	candidates := s.sources
	if forcedSourceID != "" {
		filtered := make([]source.WeightedSource, 0, len(candidates))
		for _, src := range candidates {
			if src.Source.ID() == forcedSourceID {
				filtered = append(filtered, src)
			}
		}
		if len(filtered) == 0 {
			return model.Article{}, fmt.Errorf("source %q not found or not enabled", forcedSourceID)
		}
		candidates = filtered
	}

	totalWeight := 0
	for _, src := range candidates {
		totalWeight += src.Weight
	}

	remaining := make([]source.WeightedSource, len(candidates))
	copy(remaining, candidates)
	errorsBySource := make([]string, 0, len(remaining))

	for len(remaining) > 0 {
		index := s.pickWeightedIndex(remaining, totalWeight)
		selected := remaining[index]

		articles, err := selected.Source.Fetch(ctx, fetchLimit)
		if err != nil {
			errorsBySource = append(errorsBySource, fmt.Sprintf("%s: %v", selected.Source.ID(), err))
			totalWeight -= selected.Weight
			remaining = append(remaining[:index], remaining[index+1:]...)
			continue
		}
		if len(articles) > 0 {
			picked := articles[s.rng.Intn(len(articles))]
			return picked, nil
		}

		totalWeight -= selected.Weight
		remaining = append(remaining[:index], remaining[index+1:]...)
	}

	if len(errorsBySource) > 0 {
		return model.Article{}, fmt.Errorf("%w; source errors: %s", ErrNoArticles, strings.Join(errorsBySource, " | "))
	}

	return model.Article{}, ErrNoArticles
}

func (s *Spawner) pickWeightedIndex(items []source.WeightedSource, totalWeight int) int {
	n := s.rng.Intn(totalWeight)
	running := 0
	for i, item := range items {
		running += item.Weight
		if n < running {
			return i
		}
	}
	return len(items) - 1
}
