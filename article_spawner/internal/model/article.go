package model

import "time"

type Article struct {
	Title       string
	URL         string
	SourceID    string
	PublishedAt time.Time
	Score       int
}
