# @mrclrchtr/supi-web

SuPi Web extension — fetch web pages as clean Markdown via the `web_fetch_md` pi tool.

## Scope

`@mrclrchtr/supi-web` registers a single agent-callable tool:
- `web_fetch_md` — fetches an `http(s)` URL and returns clean Markdown

## Architecture

```
src/
├── web.ts       # Extension factory — registers tool with pi
├── fetch.ts     # HTTP logic: HEAD negotiation, range sniff, sibling probe, full GET
├── convert.ts   # HTML → Markdown: JSDOM + Readability + Turndown + link absolutization
├── temp-file.ts # Temporary file helper for large content
└── index.ts     # Public API exports
```

## Content negotiation pipeline

1. **HEAD** — check `content-type` for Markdown; if so, full GET and return raw
2. **Sniff** — range GET first 8KB; detect Markdown / plain text / HTML by content + headers
3. **Siblings** — try `.md` / `.markdown` / `index.md` / `README.md` variants
4. **Full GET HTML** — JSDOM parse, strip script/style/noscript, Readability extract, Turndown convert

## Tool contract

- Only accepts `http://` and `https://` URLs; everything else is rejected with an error
- `output_mode: auto` (default) returns inline for content ≤15,000 chars; larger content is written to `/tmp/web-fetch-md-*/<hash>.md`
- `abs_links: true` (default) resolves all relative `href` and `src` to absolute URLs
- Plain text responses are wrapped in fenced code blocks with a language hint from the URL extension

## Key gotchas

- `turndown-plugin-gfm` has no `@types` package — import uses `@ts-expect-error`
- `fetchWithNegotiation` is split into 4 internal helpers to stay under Biome cognitive complexity limits
- `readPartialText` handles both ReadableStream and plain text Response bodies for the range sniff
- The `noSecrets` Biome rule false-positives on test `describe()` names — suppress inline when needed

## Commands

```bash
pnpm vitest run packages/supi-web/
pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-web/__tests__/tsconfig.json
pnpm exec biome check packages/supi-web/
```
