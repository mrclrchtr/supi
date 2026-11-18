# Changelog

## [13.1.0]

- `web_fetch_md` now reads PDFs. It returns the text layer as Markdown with one `## Page N` section per page, instead of the raw PDF bytes. A PDF without a text layer (such as a scan), a password-protected or unreadable PDF, or one over 32 MB fails the call with a message that names the cause.
- `web_fetch_md` now saves PNG, JPEG, GIF, WebP, and BMP images to a temporary file and returns the path, so the agent can view the image with the `read` tool. Other binary content, such as archives, fails the call instead of returning bytes as text.
- `web_fetch_md` now returns SVG, RSS, Atom, and other XML as fenced source text. These were converted as HTML before, which often returned nothing.
- If Web Search is enabled and bx has no Brave API key, SuPi now warns at session start. The check is local: it reads `BRAVE_SEARCH_API_KEY` or runs `bx config show-key`, with no network request or quota use. `web_search` stays available, so a later `bx config set-key` works without `/reload`.
- When bx fails because no API key is configured, `web_search` now names the missing key and how to set it, instead of suggesting a bx version problem.

## [13.0.0]

- `web_search` requests about half as much source text per search (a 4,096-token budget instead of the Brave default of about 8,192), so one search uses less of the context window. Results hold fewer sources; search again with a narrower query when the first results are not enough.
- Web tool output files are now written to one private per-user directory, `$TMPDIR/supi-<uid>/`, instead of a new `supi-*` directory per call. Identical content reuses one file. SuPi never deletes these files; the OS temp purge does ([#597](https://github.com/mrclrchtr/supi/issues/597)).

## [12.0.0]

- **Breaking:** Web tool parameters are camelCase, like every other SuPi tool. `web_fetch_md`: `output_mode` → `outputMode`, `fetch_mode` → `fetchMode`, `abs_links` → `absLinks`, `timeout_ms` → `timeoutMs`. `web_docs_search`: `library_name` → `libraryName`. `web_docs_fetch`: `library_id` → `libraryId`. Values such as `firecrawl_fallback` are unchanged. Update codemode scripts and saved prompts that pass the old names; they are now rejected as unknown fields.
- Codemode now lists the Web tools under a `web` namespace heading, so scripts can find them with `describeNamespace("web")` or `searchTools(query, { namespace: "web" })`. Every Web tool now declares audited `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations, which permission extensions can read from `pi.getAllTools()`. They are read-only and open-world ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.4.0]

- Guides agents toward the library documentation tools for library and framework usage questions, while keeping web search available for issues, release notes, and news.

## [11.3.0]

- Provides its tools to SuPi Agent Runs and Reviewer Sessions when those packages request them.
- Added package-specific release notes for web fetching, search, and library documentation tools.
