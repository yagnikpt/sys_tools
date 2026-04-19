package source

import (
	"context"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
)

type Source interface {
	ID() string
	Fetch(ctx context.Context, limit int) ([]model.Article, error)
}
