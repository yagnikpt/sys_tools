# article_spawner

Open a random article from configured sources.

Supports:
- RSS feeds (`kind: rss`)
- API providers (`kind: api`), which right now only includes Hacker News and Dev.to

## Install

### Homebrew

```bash
brew install yagnikpt/tap/article_spawner
```

### Go

```bash
go install github.com/yagnikpt/sys_tools/article_spawner@latest
```

## Config

Default path: `~/.config/article_spawner/config.yaml` (XDG `ConfigHome`).

If the config file does not exist, the tool auto-generates it with a working default config.

### Example

```yaml
defaults:
  timeout_sec: 10
  user_agent: facebookexternalhit/1.1
  fetch_limit: 30

sources:
  - id: lobsters-newest
    kind: rss
    enabled: true
    weight: 1
    rss:
      url: https://lobste.rs/newest.rss

  - id: hn
    kind: api
    enabled: true
    weight: 1
    api:
      provider: hackernews
      options:
        story_type: top # top | new | best
        max_items: 50

  - id: devto-go
    kind: api
    enabled: true
    weight: 1
    api:
      provider: devto
      options:
        state: rising  # fresh | rising | all
        top_days: 7
        per_page: 30
        tag: go, linux, devops
```

## Usage

```bash
article_spawner
```

Flags:
- `--config` path to config yaml (default: `~/.config/article_spawner/config.yaml`)
- `--config-path` print default config path
- `--list | --ls` list all sources from config
- `--source` force a single source id
- `--dry-run | --print` print selected article, do not open it

### Examples

```bash
article_spawner --dry-run
article_spawner --config-path
article_spawner --list
article_spawner --source hackernews --dry-run
```

## Add new sources

- Add RSS: append another `kind: rss` entry with a unique `id`.
- Add API provider: implement provider in `internal/source/api/<provider>` and register it via `api.RegisterProvider(...)`, then use it in YAML via `api.provider`.

## API Provider Template

Use this structure for new API providers:

```go
package myprovider

import (
  "context"
  "net/http"
  "github.com/yagnikpt/sys_tools/article_spawner/internal/model"
  "github.com/yagnikpt/sys_tools/article_spawner/internal/source/api"
)

type Provider struct {
  client *http.Client
}

func init() {
  api.RegisterProvider("myprovider", newProvider)
}

func newProvider(options map[string]any, client *http.Client, userAgent string) (api.Provider, error) {
  return &Provider{client: client}, nil
}

func (p *Provider) Fetch(ctx context.Context, limit int) ([]model.Article, error) {
  // call API, map response to []model.Article
  return nil, nil
}
```

Then add a blank import in `internal/source/factory.go`:

```go
_ "github.com/yagnikpt/sys_tools/article_spawner/internal/source/api/myprovider"
```

And use it in YAML:

```yaml
sources:
  - id: my-api
    kind: api
    weight: 1
    api:
      provider: myprovider
      options:
        foo: bar
```
