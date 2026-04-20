# bmark

Track reading progress for local PDF/EPUB files and reopen from the last page.

Supports:
- `papers` as the reader
- `fzf` (default) or `rofi` (optional) for selection
- saved progress via `gio` metadata + local save file

## Install

```bash
go install github.com/yagnikpt/sys_tools/bmark@latest
```

## Dependencies

- `papers` (reader)
- `gio` (read current page from metadata)
- `pdfinfo` (read total PDF pages)
- `fzf` (default picker)
- `rofi` (optional picker with `--rofi`)

## Save data

Save file path:

- `~/.local/share/bmark/saves.toml` (XDG `DataHome`)

Each entry stores:
- file path
- current page
- total pages (for PDFs)
- last read timestamp
- last opened file key

## Usage

```bash
bmark [flags] [file]
```

Flags:
- `--continue` open last opened file
- `--rofi` use rofi instead of fzf
- `--rofi-config` path to rofi theme/config file

When no file is provided, bmark shows a menu:
- `continue` reopen last opened file
- `pick` choose from previously saved books
- `new` scan local docs and pick a new file

`new` scans these directories:
- `~/Documents/books`
- `~/Documents/Books`

## Examples

```bash
bmark
bmark --continue
bmark --rofi
bmark --rofi --rofi-config ~/.config/rofi/themes/spotlight.rasi
bmark ~/Documents/books/some-book.pdf
```
