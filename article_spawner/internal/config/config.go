package config

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.yaml.in/yaml/v4"
)

type Config struct {
	Defaults DefaultsConfig `yaml:"defaults"`
	Sources  []SourceConfig `yaml:"sources"`
}

type DefaultsConfig struct {
	TimeoutSec int    `yaml:"timeout_sec"`
	UserAgent  string `yaml:"user_agent"`
	FetchLimit int    `yaml:"fetch_limit"`
}

type SourceConfig struct {
	ID      string    `yaml:"id"`
	Kind    string    `yaml:"kind"`
	Enabled *bool     `yaml:"enabled,omitempty"`
	Weight  int       `yaml:"weight,omitempty"`
	RSS     RSSConfig `yaml:"rss,omitempty"`
	API     APIConfig `yaml:"api,omitempty"`
}

type RSSConfig struct {
	URL string `yaml:"url"`
}

type APIConfig struct {
	Provider string         `yaml:"provider"`
	Options  map[string]any `yaml:"options,omitempty"`
}

func Load(path string) (Config, error) {
	path = resolvePath(path)
	if err := ensureConfigFile(path); err != nil {
		return Config{}, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config %q: %w", path, err)
	}

	var cfg Config
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("decode yaml %q: %w", path, err)
	}

	cfg.applyDefaults()
	cfg.Normalize()
	if err := cfg.validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func ensureConfigFile(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat config %q: %w", path, err)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create config directory for %q: %w", path, err)
	}

	cfg := defaultConfig()
	raw, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal default config: %w", err)
	}

	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return fmt.Errorf("write default config %q: %w", path, err)
	}

	return nil
}

func defaultConfig() Config {
	cfg := Config{
		Defaults: DefaultsConfig{},
		Sources: []SourceConfig{
			{
				ID:      "lobsters-newest",
				Kind:    "rss",
				Enabled: new(true),
				Weight:  1,
				RSS: RSSConfig{
					URL: "https://lobste.rs/newest.rss",
				},
			},
			{
				ID:      "hn",
				Kind:    "api",
				Enabled: new(true),
				Weight:  1,
				API: APIConfig{
					Provider: "hackernews",
					Options: map[string]any{
						"story_type": "top",
						"max_items":  50,
					},
				},
			},
			{
				ID:      "devto-go",
				Kind:    "api",
				Enabled: new(true),
				Weight:  1,
				API: APIConfig{
					Provider: "devto",
					Options: map[string]any{
						"state":    "rising",
						"top_days": 7,
						"per_page": 30,
						"tag":      "go, linux, devops",
					},
				},
			},
		},
	}

	cfg.applyDefaults()
	cfg.Normalize()
	return cfg
}

func (c *Config) applyDefaults() {
	c.Defaults.applyDefaults()
	for i := range c.Sources {
		c.Sources[i].applyDefaults()
	}
}

func (d *DefaultsConfig) applyDefaults() {
	if d.TimeoutSec <= 0 {
		d.TimeoutSec = 10
	}
	if d.FetchLimit <= 0 {
		d.FetchLimit = 30
	}
	if strings.TrimSpace(d.UserAgent) == "" {
		d.UserAgent = "facebookexternalhit/1.1"
	}
}

func (s *SourceConfig) applyDefaults() {
	if s.Weight <= 0 {
		s.Weight = 1
	}
}

func (s SourceConfig) IsEnabled() bool {
	if s.Enabled == nil {
		return true
	}
	return *s.Enabled
}

func (d DefaultsConfig) Timeout() time.Duration {
	return time.Duration(d.TimeoutSec) * time.Second
}

func (c Config) validate() error {
	if len(c.Sources) == 0 {
		return fmt.Errorf("config has no sources")
	}

	seenIDs := make(map[string]struct{}, len(c.Sources))
	enabledCount := 0

	for i, src := range c.Sources {
		indexLabel := fmt.Sprintf("sources[%d]", i)

		src.ID = strings.TrimSpace(src.ID)
		if src.ID == "" {
			return fmt.Errorf("%s.id must not be empty", indexLabel)
		}
		if _, exists := seenIDs[src.ID]; exists {
			return fmt.Errorf("duplicate source id %q", src.ID)
		}
		seenIDs[src.ID] = struct{}{}

		src.Kind = strings.TrimSpace(strings.ToLower(src.Kind))
		switch src.Kind {
		case "rss":
			if strings.TrimSpace(src.RSS.URL) == "" {
				return fmt.Errorf("%s.rss.url is required for kind=rss", indexLabel)
			}
		case "api":
			if strings.TrimSpace(src.API.Provider) == "" {
				return fmt.Errorf("%s.api.provider is required for kind=api", indexLabel)
			}
		default:
			return fmt.Errorf("%s.kind must be one of: rss, api", indexLabel)
		}

		if src.Weight <= 0 {
			return fmt.Errorf("%s.weight must be > 0", indexLabel)
		}

		if src.IsEnabled() {
			enabledCount++
		}
	}

	if enabledCount == 0 {
		return fmt.Errorf("config has no enabled sources")
	}

	return nil
}

func (c *Config) Normalize() {
	c.Defaults.UserAgent = strings.TrimSpace(c.Defaults.UserAgent)

	for i := range c.Sources {
		c.Sources[i].ID = strings.TrimSpace(c.Sources[i].ID)
		c.Sources[i].Kind = strings.TrimSpace(strings.ToLower(c.Sources[i].Kind))
		c.Sources[i].RSS.URL = strings.TrimSpace(c.Sources[i].RSS.URL)
		c.Sources[i].API.Provider = strings.TrimSpace(strings.ToLower(c.Sources[i].API.Provider))
	}
}
