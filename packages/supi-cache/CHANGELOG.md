# Changelog

## [12.0.0]

- **Breaking:** `cache_forensics` rejects unknown parameters instead of ignoring them, and `maxSessions` must be at least 1.
- Codemode now lists the `cache_forensics` tool under a `cache` namespace heading, so scripts can find them with `describeNamespace("cache")` or `searchTools(query, { namespace: "cache" })`. It is annotated read-only ([#582](https://github.com/mrclrchtr/supi/issues/582)).

## [11.3.0]

- Added package-specific release notes for prompt-cache inspection and regression analysis.
