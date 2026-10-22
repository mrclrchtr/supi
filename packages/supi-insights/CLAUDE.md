# CLAUDE.md

## Scope

`@mrclrchtr/supi-insights` is a PI extension that scans historical sessions, extracts metadata and LLM facets, and generates HTML reports. Command surface is `/supi-insights`, not `/insights`.

## Session file parsing

- PI session files are append-only trees. The active branch is the path from the **last entry** (current leaf) back to root via `parentId` — do not analyze every entry in the file.
- When parsing raw session files directly (bypassing `SessionManager`), call `migrateSessionEntries(entries)` after `parseSessionEntries()` to handle legacy v1/v2 files that lack `id`/`parentId`.
- Use `getActiveBranchEntries()` from `@mrclrchtr/supi-core/session` for raw active-branch entries. `buildSessionContext()` builds model-message context, including compaction and context edits; it is not a raw-entry traversal.

## Caching

- Cache keys for session-derived data should include `sessionId + filePath hash + modified timestamp`.
- This prevents collisions across branched sessions (same `sessionId`, different files) and invalidates stale caches when a session file is resumed/appended to.
- Cached metadata without cached facets should still be re-parsable for facet extraction on later runs.

## LLM facet extraction

- Uses `completeModelRequest()` and `callWithJsonResponse()` from `@mrclrchtr/supi-core/llm`; PI resolves auth, headers, environment, and endpoints.
- Long transcripts should be chunked and summarized before facet extraction to stay within token limits.
