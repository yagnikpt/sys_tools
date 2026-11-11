# focusman

A background focus daemon for Wayland (`umbriel`) and Chromium browsers that monitors active windows and browser tabs, closing distractions that deviate from your current intent.

Set your focus intent via rofi (or default config). When you work, focusman inspects window titles/desktop entries and browser tab URLs over Chrome DevTools Protocol (CDP), checking local allow/deny lists and evaluating them against your goal using fast decision models.

## How It Works

1. **Prompt**: Asks for your task via `rofi` on startup or on demand (configurable).
2. **Fast-Path Rules**: Instant allow/deny evaluation using user-defined whitelist and blacklist lists.
3. **Memory Cache**: Caches model decisions for 15 minutes (configurable) to avoid repeated API calls.
4. **LLM Evaluation**: Evaluates app/tab context against your intent using a System One decision model (`vllm-sr/d3-flash`).
5. **Action**: Automatically closes off-task tabs or windows.

## Requirements

- [Bun](https://bun.com) runtime
- `rofi` (or your preferred dmenu/prompt tool)
- Chromium or Chrome running with CDP enabled:
  ```bash
  google-chrome-stable --remote-debugging-port=9222
  ```
- Wayland compositor with Umbriel IPC socket (if using window monitor)
- A `vllm-sr` API key ([app.vllm-sr.ai](https://app.vllm-sr.ai)) in `.env` or in `config.toml`:
  ```ini
  API_KEY=sk-vsr-...
  ```

## Configuration

```
~/.config/focusman/config.toml
```

You can customize whitelist/blacklist sources and dynamic daemon settings:

```toml
[server]
port = 49312

[intent]
prompt_command = 'rofi -dmenu -p "Intent: " -theme ~/.config/rofi/modules/input_only.rasi'
default_intent = ""

[decision]
endpoint = "https://app.vllm-sr.ai/v1/systemone"
model = "vllm-sr/d3-flash"
cache_ttl_minutes = 15
# api_key = "" # Leave empty to use process.env.API_KEY

[browser]
enabled = true
ports = [9222, 9223]
allow_list = [
  "mail.google.com",
  "app.notion.com",
  "gemini.google.com",
]
homepage_allow_list = [
  "youtube.com",
  "chatgpt.com",
  "claude.ai",
  "google.com",
]
deny_list = [
  "in.pinterest.com",
  "reddit.com",
  "x.com",
  "linkedin.com",
]

[system_apps]
enabled = true
allow_list = [
  "antigravity",
  "dev.zed.Zed",
  "foot",
  "kitty",
  "org.gnome.Nautilus",
  "com.mitchellh.ghostty",
]
ignore_browsers = [
  "helium",
]
deny_list = [
  "steam",
  "discord",
  "spotify",
  "lutris",
  "heroic",
  "vlc",
  "mpv",
]
```

## CLI Usage

```bash
# Run with default config
bun run index.ts

# Or run the compiled binary
./focusman

# Custom config path and port override
./focusman --config /path/to/custom.toml --port 50000

# View help
./focusman --help
```

### Logging

Logging to `./app.log` and console debug information is only enabled when running in development mode:

```bash
NODE_ENV=development bun run index.ts
```

In production (`NODE_ENV=production` or compiled binary without dev flag), file and console logging are silent.

## Control

The daemon exposes an HTTP service (default port `49312`):

- `GET /status` — current daemon state and active intent.
- `GET /change-intent` — opens the intent prompt to update your focus goal without restarting.
