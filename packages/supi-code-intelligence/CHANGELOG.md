# Changelog

## [11.3.0]

- Added package-specific release notes for code navigation, diagnostics, and refactoring.
- Capped `code_graph` reference results distribute sites across files, with matching source-reading suggestions.
- Fixed transient navigation failures when parallel requests first access different files, while retaining freshness checks.
