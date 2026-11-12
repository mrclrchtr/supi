# Changelog

## [11.5.0]

- Codemode now lists the Web tools under a `web` namespace heading, so scripts can find them with `describeNamespace("web")` or `searchTools(query, { namespace: "web" })`. Every Web tool now declares audited `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations, which permission extensions can read from `pi.getAllTools()`. They are read-only and open-world ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.4.0]

- Guides agents toward the library documentation tools for library and framework usage questions, while keeping web search available for issues, release notes, and news.

## [11.3.0]

- Provides its tools to SuPi Agent Runs and Reviewer Sessions when those packages request them.
- Added package-specific release notes for web fetching, search, and library documentation tools.
