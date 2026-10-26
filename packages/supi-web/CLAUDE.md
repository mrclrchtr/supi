# @mrclrchtr/supi-web

SuPi Web extension — fetch web pages as clean Markdown via `web_fetch_md`,
search public sources via `web_search`, and query library documentation via
Context7 using `web_docs_search` + `web_docs_fetch`.

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

1. **web_docs_search** — uses `@upstash/context7-sdk` library search
   - Returns compact Markdown table: ID, Name, Trust Score, Benchmark Score, Snippets, shortened Versions, Description
2. **agent picks a library ID** from the results
3. **web_docs_fetch** — uses SDK `getContext` with explicit `type: "txt"` or `"json"`
   - Default mode returns pre-formatted text from Context7's API response
   - `raw: true` uses SDK normalization of both `codeSnippets` and `infoSnippets` into `{ title, content, source }[]`; this is not the untouched REST envelope
4. Resolve `CONTEXT7_API_KEY` lazily per call; missing credentials fail the call, not extension loading. Disable SDK retries and timeout to retain single-attempt, signal-driven requests.

## Output and failure contracts

- `web_fetch_md` accepts only HTTP(S). Auto mode returns content inline up to 15,000 characters, otherwise a temporary-file path. Inline model-visible output also respects Pi's line/byte limits; retain the full output when truncating.
- Resolve relative links by default. Wrap plain-text responses in fenced code blocks with a language hint from the URL extension.
- Search preserves provider sources and excerpts rather than generating an answer. Valid empty searches are successful results, not failures.
- Context7 execution propagates authentication, network, rate-limit, cancellation, and API failures as failed tool calls. Normalize only HTTP 404 with SDK error code `no_libraries_found` to an empty successful library search. Other 404s and library redirects remain failures.

## Key gotchas

- `turndown-plugin-gfm` has no `@types` package — import uses `@ts-expect-error`
- `fetchWithNegotiation` is split into 4 internal helpers to stay under Biome cognitive complexity limits
- `fetchWithNegotiation` and Context7 client calls accept `AbortSignal` and pass it through to abort-aware `fetch()` calls
- `readPartialText` handles both ReadableStream and plain text Response bodies for the range sniff
- Each tool's spec/guidance modules own its metadata; registration imports them directly. `src/tool/tool-specs.ts` is a compatibility/public API aggregator, not the registration source of truth.
- The `noSecrets` Biome rule false-positives on test `describe()` names — suppress inline when needed

## Test layout

Pure logic and settings tests live in `__tests__/unit/`. Tests that start the `bx` subprocess or PI codemode runtime live in `__tests__/integration/`.

Context7 adapter tests use the real SDK with provider-shaped HTTP fixtures, including both snippet lists and explicit JSON negotiation. Run the opt-in live contract check from the workspace root with `CONTEXT7_API_KEY` set:

```bash
SUPI_WEB_LIVE_TESTS=1 pnpm exec vitest run packages/supi-web/__tests__/integration/context7-live.test.ts
```

The live check consumes provider quota. Ordinary verification skips it and stays offline.


