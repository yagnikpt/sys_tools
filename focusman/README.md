# focusman

A small background daemon that closes browser tabs unrelated to your current task.

Set your focus intent via rofi. When you navigate the web, focusman inspects tab titles and URLs over Chrome DevTools Protocol (CDP) and evaluates them against your goal using fast decision models.

## How it works

1. **Prompt**: Sets your task via `rofi` on startup or on demand.
2. **Rules & Cache**: Checks local allow/deny lists and a short-lived memory cache.
3. **Evaluation**: Passes the sanitized URL, title, and intent to a System One decision model (`vllm-sr/d3-flash`).
4. **Action**: Closes the tab if classified as off-task.

## Requirements

- [Bun](https://bun.sh)
- `rofi`
- Chromium or Chrome running with CDP enabled:
  ```bash
  google-chrome-stable --remote-debugging-port=9222
  ```
- A `vllm-sr` API key in `.env`:
  ```ini
  API_KEY=sk-vsr-...
  ```

## Usage

```bash
bun install
eval $(cat .env) && bun run index.ts
```

If you use `just`:

```bash
just dev
```

## Control

The daemon exposes an HTTP service on port `49312`:

- `GET /status` — current daemon state and active intent.
- `GET /change-intent` — opens the rofi prompt to change the current intent without restarting.

Static domain rules can be adjusted in `browser/guard.ts`.
