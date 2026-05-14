# @mrclrchtr/supi-web

SuPi Web extension — fetch web pages as clean Markdown via `web_fetch_md`, and
query library documentation via Context7 using `web_docs_search` + `web_docs_fetch`.

## Scope

`@mrclrchtr/supi-web` registers three agent-callable tools:

- `web_fetch_md` — fetches an `http(s)` URL and returns clean Markdown
- `web_docs_search` — searches Context7 for libraries by name, returns metadata table
- `web_docs_fetch` — retrieves up-to-date documentation context for a specific library via Context7

## Architecture

```
src/
├── web.ts             # Extension factory — registers web_fetch_md tool
├── fetch.ts           # HTTP logic: HEAD negotiation, range sniff, sibling probe, full GET
├── convert.ts         # HTML → Markdown: JSDOM + Readability + Turndown + link absolutization
├── temp-file.ts       # Temporary file helper for large content
├── context7-client.ts # Thin wrapper around @upstash/context7-sdk (lazy init, error mapping)
├── docs.ts            # Extension factory — registers web_docs_search + web_docs_fetch tools
└── index.ts           # Public API exports
```

## Content negotiation pipeline (web_fetch_md)

1. **HEAD** — check `content-type` for Markdown; if so, full GET and return raw
2. **Sniff** — range GET first 8KB; detect Markdown / plain text / HTML by content + headers
3. **Siblings** — try `.md` / `.markdown` / `index.md` / `README.md` variants
4. **Full GET HTML** — JSDOM parse, strip script/style/noscript, Readability extract, Turndown convert

## Context7 pipeline (web_docs_search + web_docs_fetch)

1. **web_docs_search** — calls `GET /api/v2/libs/search` via the SDK with `libraryName` + `query`
   - Returns formatted Markdown table: Name, ID, Description, Trust Score, Benchmark Score, Snippets, Versions
2. **agent picks a library ID** from the results
3. **web_docs_fetch** — calls `GET /api/v2/context` via the SDK with `libraryId` + `query`
   - Default `type: "txt"` returns pre-formatted Markdown ready for LLM consumption
   - `raw: true` returns `type: "json"` for programmatic use
4. API key read from `CONTEXT7_API_KEY` env var automatically by the SDK; works unauthenticated with lower rate limits

## Tool contracts

### web_fetch_md
- Only accepts `http://` and `https://` URLs; everything else is rejected with an error
- `output_mode: auto` (default) returns inline for content ≤15,000 chars; larger content is written to `/tmp/web-fetch-md-*/<hash>.md`
- `abs_links: true` (default) resolves all relative `href` and `src` to absolute URLs
- Plain text responses are wrapped in fenced code blocks with a language hint from the URL extension

### web_docs_search
- `library_name` (required) — library name to search for (e.g. `react`, `next.js`)
- `query` (required) — what the agent is trying to do (used for Context7's relevance ranking)
- Returns a Markdown table of matching libraries; empty results return a clear "not found" message
- Errors (Context7 API failure, network) are surfaced with `isError: true`

### web_docs_fetch
- `library_id` (required) — Context7 library ID (e.g. `/facebook/react`, `/vercel/next.js/v15.1.8`)
- `query` (required) — specific question about the library
- `raw` (optional, default `false`) — when `true`, returns JSON-serialized snippet objects
- Default text mode returns pre-formatted Markdown from Context7's `type: "txt"` response
- Errors (library not found, rate limit, Context7Error) are surfaced with `isError: true`

## Key gotchas

- `turndown-plugin-gfm` has no `@types` package — import uses `@ts-expect-error`
- `fetchWithNegotiation` is split into 4 internal helpers to stay under Biome cognitive complexity limits
- `readPartialText` handles both ReadableStream and plain text Response bodies for the range sniff
- `@upstash/context7-sdk` is WIP (v0.3.0) — API may change; the thin wrapper `context7-client.ts` limits blast radius
- SDK calls in `context7-client.ts` are cast through `unknown` because the SDK's TypeScript types may not fully align with the actual API shape
- `Context7Error` is re-exported from `context7-client.ts` for test mocking purposes
- The `noSecrets` Biome rule false-positives on test `describe()` names — suppress inline when needed

## Commands

```bash
pnpm vitest run packages/supi-web/
pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-web/__tests__/tsconfig.json
pnpm exec biome check packages/supi-web/
```
