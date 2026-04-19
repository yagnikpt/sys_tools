package hackernews

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/source/api"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/utils"
)

const defaultBaseURL = "https://hacker-news.firebaseio.com/v0"

type Provider struct {
	client    *http.Client
	userAgent string
	baseURL   string
	storyType string
	maxItems  int
}

type item struct {
	ID    int64  `json:"id"`
	Type  string `json:"type"`
	Title string `json:"title"`
	URL   string `json:"url"`
	Time  int64  `json:"time"`
	Score int    `json:"score"`
}

func init() {
	api.RegisterProvider("hackernews", newProvider)
}

func newProvider(options map[string]any, client *http.Client, userAgent string) (api.Provider, error) {
	p := &Provider{
		client:    client,
		userAgent: strings.TrimSpace(userAgent),
		baseURL:   defaultBaseURL,
		storyType: "top",
		maxItems:  50,
	}

	if err := p.applyOptions(options); err != nil {
		return nil, err
	}

	return p, nil
}

func (p *Provider) applyOptions(options map[string]any) error {
	if len(options) == 0 {
		return nil
	}

	for key, value := range options {
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "story_type":
			storyType, err := utils.StringValue(value)
			if err != nil {
				return fmt.Errorf("api.options.story_type: %w", err)
			}
			storyType = strings.ToLower(strings.TrimSpace(storyType))
			switch storyType {
			case "top", "new", "best":
				p.storyType = storyType
			default:
				return fmt.Errorf("api.options.story_type must be one of: top, new, best")
			}

		case "max_items":
			maxItems, err := utils.IntValue(value)
			if err != nil {
				return fmt.Errorf("api.options.max_items: %w", err)
			}
			if maxItems <= 0 {
				return fmt.Errorf("api.options.max_items must be > 0")
			}
			p.maxItems = maxItems
		}
	}

	return nil
}

func (p *Provider) Fetch(ctx context.Context, limit int) ([]model.Article, error) {
	if limit <= 0 {
		return nil, nil
	}

	ids, err := p.fetchStoryIDs(ctx)
	if err != nil {
		return nil, err
	}

	max := min(limit, p.maxItems, len(ids))
	ids = ids[:max]

	items, err := p.fetchItems(ctx, ids)
	if err != nil {
		return nil, err
	}

	articles := make([]model.Article, 0, len(items))
	for _, it := range items {
		if it.URL == "" || it.Title == "" {
			continue
		}
		articles = append(articles, model.Article{
			Title:       it.Title,
			URL:         it.URL,
			PublishedAt: time.Unix(it.Time, 0),
			Score:       it.Score,
		})
	}

	return articles, nil
}

func (p *Provider) fetchStoryIDs(ctx context.Context) ([]int64, error) {
	endpoint := p.baseURL + "/" + p.storyType + "stories.json"

	var ids []int64
	if err := p.getJSON(ctx, endpoint, &ids); err != nil {
		return nil, fmt.Errorf("fetch %s stories: %w", p.storyType, err)
	}
	return ids, nil
}

func (p *Provider) fetchItems(ctx context.Context, ids []int64) ([]item, error) {
	const workers = 8

	jobs := make(chan int64)
	out := make(chan item, len(ids))

	var wg sync.WaitGroup
	workerCount := min(workers, len(ids))

	for range workerCount {
		wg.Go(func() {
			for id := range jobs {
				it, err := p.fetchItem(ctx, id)
				if err != nil {
					continue
				}
				if it.Type != "story" {
					continue
				}
				out <- it
			}
		})
	}

	go func() {
		defer close(jobs)
		for _, id := range ids {
			select {
			case <-ctx.Done():
				return
			case jobs <- id:
			}
		}
	}()

	go func() {
		wg.Wait()
		close(out)
	}()

	items := make([]item, 0, len(ids))
	for it := range out {
		items = append(items, it)
	}

	if err := ctx.Err(); err != nil {
		return nil, err
	}

	return items, nil
}

func (p *Provider) fetchItem(ctx context.Context, id int64) (item, error) {
	endpoint := p.baseURL + "/item/" + strconv.FormatInt(id, 10) + ".json"
	var it item
	if err := p.getJSON(ctx, endpoint, &it); err != nil {
		return item{}, fmt.Errorf("fetch item %d: %w", id, err)
	}
	return it, nil
}

func (p *Provider) getJSON(ctx context.Context, endpoint string, dest any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	if p.userAgent != "" {
		req.Header.Set("User-Agent", p.userAgent)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
		return err
	}
	return nil
}
