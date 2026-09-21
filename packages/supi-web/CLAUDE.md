# @mrclrchtr/supi-web

SuPi Web extension — fetch web pages as clean Markdown via `web_fetch_md`,
search public sources via `web_search`, and query library documentation via
Context7 using `web_docs_search` + `web_docs_fetch`.

## Scope

`@mrclrchtr/supi-web` has two explicit surfaces:
- `@mrclrchtr/supi-web/extension` → `src/extension.ts` registers the web tools; `web_search` is conditional on settings and bx availability
- `@mrclrchtr/supi-web/api` → `src/api.ts` exposes the programmatic helpers

The package registers four agent-callable tools:

- `web_fetch_md` — fetches an `http(s)` URL and returns clean Markdown
- `web_search` — searches the public web through the installed `bx` executable and returns source excerpts
- `web_docs_search` — searches Context7 for libraries by name, returns metadata table
- `web_docs_fetch` — retrieves up-to-date documentation context for a specific library via Context7

## Architecture

```
src/
├── api.ts             # Public package exports
├── extension.ts       # Aggregated extension entrypoint — registers all tools
├── web.ts             # Extension factory — registers web_fetch_md tool
├── fetch.ts           # HTTP logic: HEAD negotiation, range sniff, sibling probe, full GET
├── convert.ts         # HTML → Markdown: JSDOM + Readability + Turndown + link absolutization
├── temp-file.ts       # Temporary file helper for large content
├── context7-client.ts # REST API client for Context7 (direct fetch, auth header handling)
├── config.ts          # Web Search setting and defaults
├── settings-registration.ts # Web Search settings contribution
├── docs.ts            # Extension factory — registers web_docs_search + web_docs_fetch tools
├── tool/
│   ├── tool-specs.ts # Aggregate exports for tool metadata, schemas, and input types
│   ├── result.ts     # Shared model-visible truncation helper
│   └── web_*/        # Per-tool specs, guidance, execution, results, and rendering
```

## Content negotiation pipeline (web_fetch_md)

1. **HEAD** — check `content-type` for Markdown; if so, full GET and return raw
2. **Sniff** — range GET first 8KB; detect Markdown / plain text / HTML by content + headers
3. **Siblings** — try `.md` / `.markdown` / `index.md` / `README.md` variants
4. **Full GET HTML** — JSDOM parse, strip script/style/noscript, Readability extract, Turndown convert

## Web Search pipeline (web_search)

1. Validate `query` and optional freshness.
2. Run one direct `bx context` process with the query after `--`.
3. Parse required `grounding.generic` source data and format all sources and excerpts.
4. Apply the shared model-visible output limit.

The tool registers only when Web Search is enabled and `bx` is available on `PATH`. Settings apply after `/reload`; the setting does not change active tools during apply. Missing `bx` produces a human warning and does not stop the extension.

## Context7 pipeline (web_docs_search + web_docs_fetch)

1. **web_docs_search** — calls `GET /api/v2/libs/search` directly with `libraryName` + `query`
   - Returns compact Markdown table: ID, Name, Trust Score, Benchmark Score, Snippets, shortened Versions, Description
2. **agent picks a library ID** from the results
3. **web_docs_fetch** — calls `GET /api/v2/context` directly with `libraryId` + `query`
   - Default mode returns pre-formatted text from Context7's API response
   - `raw: true` returns parsed JSON snippet objects for programmatic use
4. API key read from `CONTEXT7_API_KEY` env var automatically; without a key, requests return an authentication error

## Tool contracts

### web_fetch_md
- Only accepts `http://` and `https://` URLs; everything else is rejected with an error
- `output_mode: auto` (default) returns inline for content ≤15,000 chars; larger content is written to `/tmp/web-fetch-md-*/<hash>.md`
- Any model-visible inline output is truncated to PI's default 2,000-line / 50KB limit; truncated full output is saved to a temp file
- `abs_links: true` (default) resolves all relative `href` and `src` to absolute URLs
- Plain text responses are wrapped in fenced code blocks with a language hint from the URL extension

### web_search
- `query` (required) — public web search terms or a question
- `freshness` (optional) — `pd`, `pw`, `pm`, `py`, or an ordered `YYYY-MM-DDtoYYYY-MM-DD` range
- Returns source titles, URLs, and provider excerpts; it does not generate an answer
- Requires `bx` on `PATH`; missing `bx` leaves this tool unregistered
- Search output uses provider defaults and preserves all returned sources and excerpts

### web_docs_search
- `library_name` (required) — library name to search for (e.g. `react`, `next.js`)
- `query` (required) — what the agent is trying to do (used for Context7's relevance ranking)
- Returns a Markdown table of matching libraries; empty results return a clear "not found" message
- Errors (Context7 API failure, network) are signaled by throwing from `execute()` so PI marks the tool result as failed

### web_docs_fetch
- `library_id` (required) — Context7 library ID (e.g. `/facebook/react`, `/vercel/next.js/v15.1.8`)
- `query` (required) — specific question about the library
- `raw` (optional, default `false`) — when `true`, returns JSON-serialized snippet objects
- Default text mode returns pre-formatted Markdown from Context7's `type: "txt"` response
- Errors (library not found, rate limit, Context7Error) are signaled by throwing from `execute()` so PI marks the tool result as failed

## Key gotchas

- `turndown-plugin-gfm` has no `@types` package — import uses `@ts-expect-error`
- `fetchWithNegotiation` is split into 4 internal helpers to stay under Biome cognitive complexity limits
- `fetchWithNegotiation` and Context7 client calls accept `AbortSignal` and pass it through to abort-aware `fetch()` calls
- `readPartialText` handles both ReadableStream and plain text Response bodies for the range sniff
- Tool metadata lives in `src/tool/tool-specs.ts`; registration and docs derive names, labels, schemas, snippets, and guidelines from it
- The `noSecrets` Biome rule false-positives on test `describe()` names — suppress inline when needed

## Test layout

Pure logic and settings tests live in `__tests__/unit/`. Tests that start the `bx` subprocess live in `__tests__/integration/`.


