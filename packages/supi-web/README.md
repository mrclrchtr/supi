# @mrclrchtr/supi-web

Fetch web pages as clean Markdown via the `web_fetch_md` tool for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

Included in `@mrclrchtr/supi`, or install standalone:

```bash
pi install npm:@mrclrchtr/supi-web
```

For local development:

```bash
pi install ./packages/supi-web
```

After editing the source, run `/reload` to pick up changes.

## What it adds

Registers the `web_fetch_md` tool — callable by the agent to fetch an `http(s)` URL and return clean Markdown.

## Parameters

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

## Source

- Entrypoint: `src/web.ts`

## Commands

```bash
pnpm vitest run packages/supi-web/
pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json
pnpm exec biome check packages/supi-web/
```
