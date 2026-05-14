# Archive

## Verification Results

### Tests
- Before: 27 tests passing
- After: 63 tests passing (36 new tests added)
- `pnpm vitest run packages/supi-web/` → PASS (63) FAIL (0)

### TypeScript
- Source: No errors
- Tests: No errors

### Biome lint
- No fixes applied
- 0 errors, 0 warnings

### Changes

**Task 1 — `isPlainTextContentType` defensive fix** (`src/fetch.ts`):
- Added `isHtmlContentType(ct)` guard to prevent `text/html` from being misclassified as plain text
- Exported the function (same pattern as `isHtml` and `looksLikeMarkdown`) for testing

**Task 2 — `guessLanguage` expansion** (`src/fetch.ts`):
- Expanded from 11 to ~50 extension mappings covering: python, javascript, typescript, jsx/tsx, go, rust, java, ruby, c/c++, kotlin, swift, dart, php, perl, lua, elixir, r, sql, css/scss/less, html, markdown, vue/svelte, dockerfile, graphql, powershell, yaml, toml, json, xml, ini, conf, sh/bash/zsh, and more
- Added suppression for nursery `noExcessiveLinesPerFile` rule (nursery, not stable)

**Task 3 — Test coverage** (`__tests__/fetch.test.ts`):
- Added `isPlainTextContentType` describe block: 9 tests covering text/*, text/html exclusion, application/xml, case-insensitivity, empty string
- Added `guessLanguage` describe block: 27 tests covering all new extensions, query/fragment handling, malformed URL, case-insensitivity, unknown extensions
