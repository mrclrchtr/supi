# @mrclrchtr/supi-web

Adds web-page fetching and library-documentation lookup tools to the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-web
```

For local development:

```bash
pi install ./packages/supi-web
```

After editing the source, run `/reload`.

## What you get

After install, pi gets three tools:

- `web_fetch_md` — fetch a web page and convert it to Markdown
- `web_docs_search` — search Context7 for a library ID
- `web_docs_fetch` — fetch up-to-date documentation for a specific Context7 library

## Choose the right tool

### `web_fetch_md`

Use this for general web pages.

Important behavior:

- accepts only real `http://` or `https://` URLs
- defaults to `output_mode: auto`
- returns Markdown inline when the result is at most **15,000 characters**
- otherwise writes the Markdown to a temporary `.md` file and returns the file path
- absolutizes links and image URLs by default
- wraps plain-text responses as fenced code blocks instead of pretending they are prose

The fetch pipeline tries several strategies in order:

1. Markdown-aware content negotiation
2. content sniffing
3. sibling `.md` / `.markdown` probing
4. HTML fetch followed by Readability + Turndown conversion

### `web_docs_search`

Use this when you need a Context7 library ID first.

It returns a Markdown table of matching libraries with fields such as:

- ID
- name
- description
- trust score
- benchmark score
- snippet count
- versions

### `web_docs_fetch`

Use this when you already know the Context7 library ID and want current docs or snippets for a specific question.

- `library_id` is required
- `query` is required
- `raw: true` returns JSON-serialized snippet objects instead of plain text Markdown

## Context7 notes

`web_docs_search` and `web_docs_fetch` use Context7 through `@upstash/context7-sdk`.

If `CONTEXT7_API_KEY` is set, the SDK will use it automatically.

## Package surfaces

- `@mrclrchtr/supi-web/api` — conversion helpers, fetch helpers, and extension exports
- `@mrclrchtr/supi-web/extension` — extension entrypoint that registers all three tools

## Source

- `src/web.ts` — `web_fetch_md`
- `src/docs.ts` — `web_docs_search` and `web_docs_fetch`
- `src/fetch.ts` — HTTP fetching and negotiation
- `src/convert.ts` — HTML-to-Markdown conversion
- `src/context7-client.ts` — Context7 client wrapper
- `src/temp-file.ts` — temp-file output helper
- `src/tool/web-fetch-md-guidance.ts` — model-facing prompt surfaces for `web_fetch_md`
- `src/tool/web-docs-search-guidance.ts` — model-facing prompt surfaces for `web_docs_search`
- `src/tool/web-docs-fetch-guidance.ts` — model-facing prompt surfaces for `web_docs_fetch`
