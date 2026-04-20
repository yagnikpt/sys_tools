# sys_tools

A monorepo of personal utility CLI tools for Linux. Btw these tools are vibecoded with reviewing.

---

## Tools

### `article_spawner` — open a random article

Pick and open a random article from configured sources. Supports RSS feeds and API providers (Hacker News, Dev.to).
To read more [README.md](./article_spawner/README.md)

Instead of getting distracted and spending time on random thing, this helps to quickly spawn a content which is better.

```bash
go install github.com/yagnikpt/sys_tools/article_spawner@latest
```

---

### `bmark` — PDF reading tracker

Track reading progress across PDF files. Uses Papers as the viewer, syncs last-read page via GIO metadata. Supports fzf and rofi for picking. To read more [README.md](./bmark/README.md)
I personally use it to keep track of the books i read.

**Dependencies**

| Tool | Purpose |
|------|---------|
| `papers` | PDF viewer |
| `gio` | reads last-read page from file metadata |
| `pdfinfo` | reads file metadata |
| `fzf` | default fuzzy picker |
| `rofi` | optional picker (`--rofi`) |

```bash
go install github.com/yagnikpt/sys_tools/bmark@latest
```

---


### `screen_ocr` — screenshot to clipboard via OCR

Select a region of the screen, extract text from it, copy to clipboard. Supports niri and GNOME.

**Dependencies**

| Tool | Purpose |
|------|---------|
| `tesseract` | OCR engine |
| `grim` + `slurp` | screenshot capture (niri) |
| `gnome-screenshot` | screenshot capture (GNOME) |

```bash
go install github.com/yagnikpt/sys_tools/screen_ocr@latest
```
