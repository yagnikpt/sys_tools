package devto

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/source/api"
	"github.com/yagnikpt/sys_tools/article_spawner/internal/utils"
)

const defaultBaseURL = "https://dev.to/api"

type Provider struct {
	client    *http.Client
	userAgent string
	baseURL   string
	state     string
	topDays   int
	perPage   int
	tag       string
}

type articleItem struct {
	Title                  string `json:"title"`
	URL                    string `json:"url"`
	PublishedAt            string `json:"published_at"`
	PositiveReactionsCount int    `json:"positive_reactions_count"`
}

func init() {
	api.RegisterProvider("devto", newProvider)
}

func newProvider(options map[string]any, client *http.Client, userAgent string) (api.Provider, error) {
	p := &Provider{
		client:    client,
		userAgent: strings.TrimSpace(userAgent),
		baseURL:   defaultBaseURL,
		state:     "rising",
		topDays:   7,
		perPage:   30,
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
		case "state":
			state, err := utils.StringValue(value)
			if err != nil {
				return fmt.Errorf("api.options.state: %w", err)
			}
			state = strings.ToLower(strings.TrimSpace(state))
			switch state {
			case "fresh", "rising", "all":
				p.state = state
			default:
				return fmt.Errorf("api.options.state must be one of: fresh, rising, all")
			}

		case "top_days":
			topDays, err := utils.IntValue(value)
			if err != nil {
				return fmt.Errorf("api.options.top_days: %w", err)
			}
			if topDays <= 0 {
				return fmt.Errorf("api.options.top_days must be > 0")
			}
			p.topDays = topDays

		case "per_page":
			perPage, err := utils.IntValue(value)
			if err != nil {
				return fmt.Errorf("api.options.per_page: %w", err)
			}
			if perPage <= 0 || perPage > 100 {
				return fmt.Errorf("api.options.per_page must be between 1 and 100")
			}
			p.perPage = perPage

		case "tag":
			tag, err := utils.StringValue(value)
			if err != nil {
				return fmt.Errorf("api.options.tag: %w", err)
			}
			p.tag = strings.TrimSpace(tag)
		}
	}

	return nil
}

func (p *Provider) Fetch(ctx context.Context, limit int) ([]model.Article, error) {
	if limit <= 0 {
		return nil, nil
	}

	items, err := p.fetchArticles(ctx, limit)
	if err != nil {
		return nil, err
	}

	articles := make([]model.Article, 0, len(items))
	for _, it := range items {
		if it.URL == "" || it.Title == "" {
			continue
		}

		article := model.Article{
			Title: it.Title,
			URL:   it.URL,
			Score: it.PositiveReactionsCount,
		}

		if t, err := time.Parse(time.RFC3339, it.PublishedAt); err == nil {
			article.PublishedAt = t
		}

		articles = append(articles, article)
	}

	return articles, nil
}

func (p *Provider) fetchArticles(ctx context.Context, limit int) ([]articleItem, error) {
	perPage := min(p.perPage, limit)

	query := url.Values{}
	query.Set("state", p.state)
	query.Set("per_page", strconv.Itoa(perPage))
	if p.topDays > 0 {
		query.Set("top", strconv.Itoa(p.topDays))
	}
	if p.tag != "" {
		query.Set("tag", p.tag)
	}

	endpoint := p.baseURL + "/articles?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if p.userAgent != "" {
		req.Header.Set("User-Agent", p.userAgent)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var items []articleItem
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, err
	}

	return items, nil
}
