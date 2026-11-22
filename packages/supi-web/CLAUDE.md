# @mrclrchtr/supi-web

SuPi Web extension — fetch web pages as clean Markdown via `web_fetch_md`,
search public sources via `web_search`, and query library documentation via
Context7 using `web_docs_search` + `web_docs_fetch`.

## Content negotiation pipeline (web_fetch_md)

1. **HEAD** — check `content-type` for Markdown; if so, full GET and return raw
2. **Sniff** — range GET first 8KB; detect PDF / image / binary / Markdown / plain text / HTML by content + headers. A PDF (content type or `%PDF-` signature) is fetched in full and its text layer extracted with `unpdf` under `## Page N` headings
3. **Siblings** — try `.md` / `.markdown` / `index.md` / `README.md` variants
4. **Full GET HTML** — JSDOM parse, strip script/style/noscript, Readability extract, Turndown convert

## Web Search pipeline (web_search)

1. Validate `query` and optional freshness.
2. Run one direct `bx context --max-tokens 4096` process with the query after `--`. The budget halves the service default; see `docs/ops/web-search-design.md` § Result size.
3. Parse required `grounding.generic` source data and format all sources and excerpts.
4. Apply the shared model-visible output limit.

The tool registers only when Web Search is enabled and `bx` is available on `PATH`. Settings apply after `/reload`; the setting does not change active tools during apply. Missing `bx` produces a human warning and does not stop the extension. A missing Brave API key (`hasBxApiKey()`: env var or `bx config show-key`, no network) also warns but keeps the tool registered; the same check turns a `bx context` exit 2 into a missing-key error.

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
- Preserve native Markdown unchanged. For HTML conversion, `absLinks` defaults to true; false preserves original destinations. Filter unsafe URL schemes in both HTML modes. Wrap plain-text responses in fenced code blocks with a language hint from the content type when it names one (JSON, XML, YAML, JavaScript, CSS, CSV), otherwise from the URL extension.
- A direct fetch that succeeds without usable content sets `notice` (shown before the content, never written into `markdown` or the file): an empty body, or converted HTML with under 100 characters of text. Short Markdown, plain text, and JSON are what the server sent and get no notice. Firecrawl rejects empty content itself.
- Decode bodies with `readBodyText`, not `Response.text()`, which ignores the declared charset.
- Minified JSON (a line over 500 characters) is re-indented by copying tokens, not by `JSON.parse` + `stringify`, so large integers and escapes stay exact.
- Search preserves provider sources and excerpts rather than generating an answer. Valid empty searches are successful results, not failures.
- Context7 execution propagates authentication, network, rate-limit, cancellation, and API failures as failed tool calls. The SDK returns every HTTP 404 from library search as an empty successful search. Other search errors, documentation 404s, and library redirects remain failures.

## Key gotchas

- XML data types (`/xml`, `+xml`, not XHTML) are returned as plain text before the HTML check: `isHtml` matches any `<?xml` declaration, so SVG and feeds were otherwise converted as HTML and came back empty.
- Never return bytes as text. Images with a `read`-supported content type are saved as spill files (`result.image`, file mode with `mediaType`); other binary content (NUL in the sniff) and PDF failures (over 32 MB, password-protected, unreadable, no text layer) throw `FetchError`. `unpdf` 2.x declares Node 24, while Pi supports Node 22.19; SuPi uses only `getDocumentProxy` and `extractText`, which work on Node 22. Recheck Node 22 before upgrading `unpdf`. It loads lazily on the first PDF.
- `turndown-plugin-gfm` has no `@types` package — import uses `@ts-expect-error`
- `fetchWithNegotiation` is split into 4 internal helpers to stay under Biome cognitive complexity limits
- `fetchWithNegotiation` and Context7 client calls accept `AbortSignal` and pass it through to abort-aware `fetch()` calls
- `readPartialText` handles both ReadableStream and plain text Response bodies for the range sniff
- Each tool's spec/guidance modules own its metadata; registration imports them directly. `src/tool/tool-specs.ts` is a compatibility/public API aggregator, not the registration source of truth.
- The `noSecrets` Biome rule false-positives on test `describe()` names — suppress inline when needed

## Test layout

Pure logic and settings tests live in `__tests__/unit/`. Tests that start the `bx` subprocess or Pi codemode runtime live in `__tests__/integration/`.

Context7 adapter tests use the real SDK with provider-shaped HTTP fixtures, including both snippet lists and explicit JSON negotiation. Run the opt-in live contract check from the workspace root with `CONTEXT7_API_KEY` set:

```bash
SUPI_WEB_LIVE_TESTS=1 pnpm exec vitest run packages/supi-web/__tests__/integration/context7-live.test.ts
```

The live check consumes provider quota. Ordinary verification skips it and stays offline.


