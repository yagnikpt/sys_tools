# sys_tools

A collection of personal utility CLI tools for Linux.

---

## Tools

### `bmark` — PDF reading tracker

Track reading progress across PDF files. Uses Papers as the viewer, syncs last-read page via GIO metadata. Supports fzf and rofi for picking.

**Dependencies**

| Tool | Purpose |
|------|---------|
| `papers` | PDF viewer |
| `gio` | reads last-read page from file metadata |
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
