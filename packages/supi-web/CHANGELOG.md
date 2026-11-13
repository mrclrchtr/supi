# Changelog

## [12.1.0]

- `web_search` requests about half as much source text per search (a 4,096-token budget instead of the Brave default of about 8,192), so one search uses less of the context window. Results hold fewer sources; search again with a narrower query when the first results are not enough.

## [12.0.0]

- **Breaking:** Web tool parameters are camelCase, like every other SuPi tool. `web_fetch_md`: `output_mode` → `outputMode`, `fetch_mode` → `fetchMode`, `abs_links` → `absLinks`, `timeout_ms` → `timeoutMs`. `web_docs_search`: `library_name` → `libraryName`. `web_docs_fetch`: `library_id` → `libraryId`. Values such as `firecrawl_fallback` are unchanged. Update codemode scripts and saved prompts that pass the old names; they are now rejected as unknown fields.
- Codemode now lists the Web tools under a `web` namespace heading, so scripts can find them with `describeNamespace("web")` or `searchTools(query, { namespace: "web" })`. Every Web tool now declares audited `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations, which permission extensions can read from `pi.getAllTools()`. They are read-only and open-world ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.4.0]

- Guides agents toward the library documentation tools for library and framework usage questions, while keeping web search available for issues, release notes, and news.

## [11.3.0]

- Provides its tools to SuPi Agent Runs and Reviewer Sessions when those packages request them.
- Added package-specific release notes for web fetching, search, and library documentation tools.
