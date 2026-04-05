package saves

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/BurntSushi/toml"
)

type Book struct {
	Title    string `toml:"title"`
	Path     string `toml:"path"`
	Page     int    `toml:"page"`
	Total    int    `toml:"total_pages,omitempty"`
	LastRead string `toml:"last_read"` // RFC3339 timestamp
}

func (b *Book) DisplayLabel() string {
	name := filepath.Base(b.Path)
	if b.Total > 0 {
		pct := (b.Page * 100) / b.Total
		return fmt.Sprintf("p.%d/%d (%d%%) — %s", b.Page, b.Total, pct, name)
	}
	return fmt.Sprintf("p.%d — %s", b.Page, name)
}

type Saves struct {
	LastKey string          `toml:"last_opened"`
	Books   map[string]Book `toml:"books"`
}

// Load reads the savepoint file. Returns empty savepoint if file doesn't exist.
func Load() (*Saves, error) {
	sp := &Saves{Books: make(map[string]Book)}
	path := getSavesFile()

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return sp, nil
	}

	if _, err := toml.DecodeFile(path, sp); err != nil {
		return nil, fmt.Errorf("failed to decode savepoint: %w", err)
	}
	if sp.Books == nil {
		sp.Books = make(map[string]Book)
	}
	return sp, nil
}

// Save writes the savepoint atomically (write tmp → rename).
func (sp *Saves) Save() error {
	path := getSavesFile()

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("failed to create dir: %w", err)
	}

	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}

	if err := toml.NewEncoder(f).Encode(sp); err != nil {
		f.Close()
		os.Remove(tmp)
		return fmt.Errorf("failed to encode savepoint: %w", err)
	}

	f.Close()
	return os.Rename(tmp, path)
}

// UpdateBook saves a book back into the map and marks it as last opened.
func (sp *Saves) UpdateBook(b *Book) {
	abs, _ := filepath.Abs(b.Path)
	key := fileKey(abs)
	b.Path = abs
	b.LastRead = time.Now().Format(time.RFC3339)
	if b.Title == "" {
		b.Title = filepath.Base(abs)
	}
	sp.Books[key] = *b
	sp.LastKey = key
}

// GetOrCreate returns existing book for path, or a new one.
func (sp *Saves) GetOrCreate(path string) *Book {
	abs, _ := filepath.Abs(path)
	key := fileKey(abs)
	b, ok := sp.Books[key]
	if !ok {
		pages, _ := pdfTotalPages(abs)
		b = Book{
			Title: filepath.Base(abs),
			Path:  abs,
			Total: pages,
			Page:  1,
		}
	}
	return &b
}

// LastOpened returns the most recently opened book, or nil.
func (sp *Saves) LastOpened() *Book {
	if sp.LastKey == "" {
		return nil
	}
	b, ok := sp.Books[sp.LastKey]
	if !ok {
		return nil
	}
	return &b
}

// AllBooks returns all books sorted by LastRead descending.
func (sp *Saves) AllBooks() []*Book {
	books := make([]*Book, 0, len(sp.Books))
	for _, b := range sp.Books {
		bc := b
		books = append(books, &bc)
	}
	sort.Slice(books, func(i, j int) bool {
		return books[i].LastRead > books[j].LastRead
	})
	return books
}
