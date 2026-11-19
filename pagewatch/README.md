# pagewatch

Watch selected parts of web pages and send a desktop notification when they change.

On first run, pagewatch creates `~/.config/pagewatch/sources.toml` and exits so you can add sources. It follows `XDG_CONFIG_HOME` when set. Each run fetches each URL, selects nodes with XPath, hashes their serialized HTML, and sends a desktop notification when a stored hash changes. The first successful fetch records a baseline without a notification.

```toml
[[source]]
id = "example-updates"
url = "https://example.com/updates"
target_xpath = "/html/body/main/section[3]/div"
# render = true # uncomment if this section is created by JavaScript
```

IDs must be unique. A selector that matches no nodes is reported as an error and does not replace that source's previous hash. The hashfile is JSON at `~/.config/pagewatch/hashfile` (or under `XDG_CONFIG_HOME`); both paths can be overridden:

```sh
go run .
go run . --output   # print fetched data by source to stdout
go run . -o         # short alias
go run . --populate # fetch and refresh all hashes without notifications
go run . -p         # short alias
go run . -config ./sources.toml -hashfile ./hashfile
```

By default, pagewatch parses server-returned HTML. Set `render = true` only for sources whose target is built by JavaScript. Those sources use headless Chrome/Chromium: pagewatch navigates to the URL, waits for the configured XPath to appear in the browser DOM, then hashes the matching rendered nodes. One browser is reused for rendered sources during a run. Install Chrome or Chromium to use this option.

On Nobara, `notify-send` must be available and a desktop notification session must be active.

On macOS, pagewatch uses `osascript` for notifications. If any source has `render = true`, Chrome or Chromium must also be installed.

## Install

```sh
brew install --cask yagnikpt/tap/pagewatch
```

On Linux, this cask requires Homebrew's Linux cask support and `notify-send`.

Or install the latest Go module version:

```sh
go install github.com/yagnikpt/sys_tools/pagewatch@latest
```

Releases are triggered by tags in the form `pagewatch/vX.Y.Z`. The release workflow also updates the `yagnikpt/homebrew-tap` cask; it uses the repository secret `GH_TOKEN`, which needs contents write access to both repositories.
