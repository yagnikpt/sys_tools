package rss

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/mmcdole/gofeed"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
)

type Source struct {
	id      string
	feedURL string
	parser  *gofeed.Parser
}

func New(id, feedURL, userAgent string, timeout time.Duration) *Source {
	client := &http.Client{Timeout: timeout}
	parser := gofeed.NewParser()
	parser.Client = client
	if userAgent != "" {
		parser.UserAgent = userAgent
	}

	return &Source{
		id:      id,
		feedURL: feedURL,
		parser:  parser,
	}
}

func (s *Source) ID() string {
	return s.id
}

func (s *Source) Fetch(ctx context.Context, limit int) ([]model.Article, error) {
	feed, err := s.parser.ParseURLWithContext(s.feedURL, ctx)
	if err != nil {
		return nil, fmt.Errorf("fetch rss feed %q: %w", s.feedURL, err)
	}

	if len(feed.Items) == 0 {
		return nil, nil
	}

	articles := make([]model.Article, 0, min(limit, len(feed.Items)))
	for _, item := range feed.Items {
		if len(articles) >= limit {
			break
		}
		if item == nil || item.Link == "" || item.Title == "" {
			continue
		}

		article := model.Article{
			Title:    item.Title,
			URL:      item.Link,
			SourceID: s.id,
		}

		if item.PublishedParsed != nil {
			article.PublishedAt = *item.PublishedParsed
		}

		articles = append(articles, article)
	}

	return articles, nil
}
