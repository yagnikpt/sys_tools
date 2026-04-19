package api

import (
	"context"
	"fmt"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
)

type Source struct {
	id       string
	provider Provider
}

func New(id string, provider Provider) *Source {
	return &Source{id: id, provider: provider}
}

func (s *Source) ID() string {
	return s.id
}

func (s *Source) Fetch(ctx context.Context, limit int) ([]model.Article, error) {
	articles, err := s.provider.Fetch(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("fetch api source %q: %w", s.id, err)
	}

	for i := range articles {
		articles[i].SourceID = s.id
	}

	return articles, nil
}
