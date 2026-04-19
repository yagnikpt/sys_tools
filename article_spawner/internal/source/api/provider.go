package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/yagnikpt/sys_tools/article_spawner/internal/model"
)

type Provider interface {
	Fetch(ctx context.Context, limit int) ([]model.Article, error)
}

type ProviderFactory func(options map[string]any, client *http.Client, userAgent string) (Provider, error)

var (
	registryMu sync.RWMutex
	registry   = map[string]ProviderFactory{}
)

func RegisterProvider(name string, factory ProviderFactory) {
	providerName := strings.ToLower(strings.TrimSpace(name))
	if providerName == "" {
		panic("provider name must not be empty")
	}
	if factory == nil {
		panic("provider factory must not be nil")
	}

	registryMu.Lock()
	defer registryMu.Unlock()
	registry[providerName] = factory
}

func NewProvider(name string, options map[string]any, timeout time.Duration, userAgent string) (Provider, error) {
	providerName := strings.ToLower(strings.TrimSpace(name))

	registryMu.RLock()
	factory, ok := registry[providerName]
	registryMu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("unknown api provider %q", providerName)
	}

	client := &http.Client{Timeout: timeout}
	return factory(options, client, userAgent)
}
