# @mrclrchtr/supi-web

SuPi Web extension — fetch web pages as clean Markdown via the `web_fetch_md` pi tool.

## Usage

The `web_fetch_md` tool is automatically available to the agent when this extension is installed.

```
web_fetch_md url="https://example.com/docs"
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | **required** | `http://` or `https://` URL to fetch |
| `output_mode` | `"auto" \| "inline" \| "file"` | `"auto"` | `auto` returns inline if ≤15,000 chars, else writes to temp file |
| `abs_links` | `boolean` | `true` | Absolutize relative links and image sources |
| `timeout_ms` | `number` | `30000` | Fetch timeout in milliseconds |

## Content negotiation

The tool tries multiple strategies to get clean Markdown:

1. **HEAD negotiation** — checks `content-type` for Markdown
2. **Sniffing** — range GET of first 8KB to detect Markdown/plain text vs HTML
3. **Sibling probing** — tries `.md` / `.markdown` variants (e.g. `page.md` for `page.html`)
4. **HTML conversion** — full GET → JSDOM + Readability + Turndown → clean Markdown

## Installation

Via the meta-package:

```bash
npm install @mrclrchtr/supi
```

Or standalone:

```bash
npm install @mrclrchtr/supi-web
```

## Commands

```bash
pnpm vitest run packages/supi-web/
pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json
pnpm exec biome check packages/supi-web/
```
