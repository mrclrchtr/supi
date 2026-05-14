# @mrclrchtr/supi-web

Fetch web pages as clean Markdown and query library documentation via [Context7](https://context7.com) for the [pi coding agent](https://github.com/earendil-works/pi).

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

Registers three agent-callable tools:

| Tool | Purpose |
|------|---------|
| `web_fetch_md` | Fetch an `http(s)` URL and return clean Markdown |
| `web_docs_search` | Search Context7 for libraries by name |
| `web_docs_fetch` | Retrieve up-to-date documentation for a specific library via Context7 |

## web_fetch_md — Web Page to Markdown

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | **required** | `http://` or `https://` URL to fetch |
| `output_mode` | `"auto" \| "inline" \| "file"` | `"auto"` | `auto` returns inline if ≤15,000 chars, else writes to temp file |
| `abs_links` | `boolean` | `true` | Absolutize relative links and image sources |
| `timeout_ms` | `number` | `30000` | Fetch timeout in milliseconds |

### Content negotiation

The tool tries multiple strategies to get clean Markdown:

1. **HEAD negotiation** — checks `content-type` for Markdown
2. **Sniffing** — range GET of first 8KB to detect Markdown/plain text vs HTML
3. **Sibling probing** — tries `.md` / `.markdown` variants (e.g. `page.md` for `page.html`)
4. **HTML conversion** — full GET → JSDOM + Readability + Turndown → clean Markdown

## web_docs_search — Library Lookup

Searches Context7's library index and returns a Markdown table of matching libraries with metadata.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `library_name` | `string` | **required** | Library name to search for (e.g. `"react"`, `"next.js"`, `"fastapi"`) |
| `query` | `string` | **required** | What the agent is trying to do — used for relevance ranking |

### Output

Returns a Markdown table with columns: Name, ID, Description, Trust Score, Benchmark Score, Snippet Count, Versions. The agent picks a library ID from these results to pass to `web_docs_fetch`.

## web_docs_fetch — Documentation Retrieval

Fetches up-to-date documentation context for a specific library via Context7's API.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `library_id` | `string` | **required** | Context7 library ID (e.g. `/facebook/react`, `/vercel/next.js/v15.1.8`) |
| `query` | `string` | **required** | Specific question about the library |
| `raw` | `boolean` | `false` | When `true`, returns JSON-serialized snippet objects instead of plain text Markdown |

### API Key (optional)

The tool reads the `CONTEXT7_API_KEY` environment variable automatically when set. Without a key, it works with lower rate limits. Get a key at [context7.com/dashboard](https://context7.com/dashboard).

### Source files

- `src/web.ts` — `web_fetch_md` tool registration
- `src/docs.ts` — `web_docs_search` + `web_docs_fetch` tool registration
- `src/context7-client.ts` — thin wrapper around `@upstash/context7-sdk`
- `src/fetch.ts` — HTTP fetch logic
- `src/convert.ts` — HTML to Markdown conversion

## Commands

```bash
pnpm vitest run packages/supi-web/
pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json
pnpm exec biome check packages/supi-web/
```
