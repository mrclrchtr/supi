## Implementation Plan — web_docs Context7 Tool

### Files

| File | Responsibility |
|------|---------------|
| `packages/supi-web/package.json` | Add `@upstash/context7-sdk` dependency + second pi extension entrypoint |
| `packages/supi-web/src/context7-client.ts` | **New** — thin wrapper: lazy `Context7` init, `searchLibrary()`, `getContext()`, error mapping |
| `packages/supi-web/src/docs.ts` | **New** — registers `web_docs_search` + `web_docs_fetch` tools (mirrors `web.ts`) |
| `packages/supi-web/src/index.ts` | Add export for docs extension factory |
| `packages/supi-web/__tests__/context7-client.test.ts` | **New** — TDD tests for the client wrapper |
| `packages/supi-web/__tests__/docs.test.ts` | **New** — TDD tests for tool registration + execute paths |
| `packages/supi-web/CLAUDE.md` | Document new tools + architecture |
| `packages/supi-web/README.md` | Document new tools for users |

### Tasks

- [x] **Task 1**: Add `@upstash/context7-sdk` dependency
  - File: `packages/supi-web/package.json`
  - Add `"@upstash/context7-sdk": "^0.3.0"` to `dependencies`
  - Run `pnpm install`
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json` (module resolution succeeds)

- [x] **Task 2**: Create `context7-client.test.ts` (RED)
  - File: `packages/supi-web/__tests__/context7-client.test.ts`
  - Mock `@upstash/context7-sdk` using Vitest module mocking (`Context7` constructor, `Context7Error`)
  - Tests: `searchLibrary` returns results, `searchLibrary` handles empty results, `getContext` text mode, `getContext` JSON mode (raw), `getContext` propagates Context7Error, lazy client init only creates one instance
  - Verification: `pnpm vitest run packages/supi-web/__tests__/context7-client.test.ts` (all fail — RED)

- [x] **Task 3**: Implement `context7-client.ts` (GREEN)
  - File: `packages/supi-web/src/context7-client.ts`
  - Lazy-init `Context7` client (no API key needed — SDK auto-reads `CONTEXT7_API_KEY` env var)
  - Export `searchLibrary(query: string, libraryName: string): Promise<SearchResult[]>` — wraps `client.searchLibrary()`, maps `Library[]` to a clean return type with `id`, `name`, `description`, `trustScore`, `benchmarkScore`, `totalSnippets`, `versions`
  - Export `getContext(query: string, libraryId: string, raw?: boolean): Promise<string | DocSnippet[]>` — wraps `client.getContext()` with `type: "txt"` by default or `type: "json"` when `raw: true`
  - Export `Context7Error` re-export from the SDK for tests
  - Verification: `pnpm vitest run packages/supi-web/__tests__/context7-client.test.ts` (all pass — GREEN)

- [x] **Task 4**: Create `docs.test.ts` (RED)
  - File: `packages/supi-web/__tests__/docs.test.ts`
  - Mock `../src/context7-client.ts` (`searchLibrary`, `getContext`, `Context7Error`)
  - Tests: registers both `web_docs_search` and `web_docs_fetch` tools, `web_docs_search` parameter validation (missing library_name, missing query), `web_docs_search` returns formatted Markdown table of results, `web_docs_search` empty results returns helpful message, `web_docs_fetch` parameter validation (missing library_id, missing query), `web_docs_fetch` text mode returns Markdown content, `web_docs_fetch` raw mode returns JSON string, `web_docs_fetch` propagates errors from client
  - Verification: `pnpm vitest run packages/supi-web/__tests__/docs.test.ts` (all fail — RED)

- [x] **Task 5**: Implement `docs.ts` (GREEN)
  - File: `packages/supi-web/src/docs.ts`
  - Register two tools via `pi.registerTool()`:
    - `web_docs_search`: params `library_name` (required string), `query` (required string)
    - `web_docs_fetch`: params `library_id` (required string), `query` (required string), `raw` (optional boolean, default false)
  - Include `promptGuidelines` and `promptSnippet` for each tool
  - `web_docs_search` execute: calls `searchLibrary(query, libraryName)`, formats results as Markdown table (columns: name, id, description, trustScore, benchmarkScore, snippets, versions)
  - `web_docs_fetch` execute: calls `getContext(query, libraryId, raw)`, returns inline (Context7 responses are compact)
  - Error paths: validate required params, propagate `Context7Error` messages as `isError: true`
  - Follow existing `web.ts` patterns (same tool return shape, same error format)
  - Verification: `pnpm vitest run packages/supi-web/__tests__/docs.test.ts` (all pass — GREEN)

- [x] **Task 6**: Wire up exports and package manifest
  - Files: `packages/supi-web/src/index.ts`, `packages/supi-web/package.json`
  - Add `export { default as docsExtension } from "./docs.ts";` to `src/index.ts`
  - Add `"./src/docs.ts"` to `package.json` → `pi.extensions` array
  - Verification: `pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-web/__tests__/tsconfig.json`

- [x] **Task 7**: Update documentation
  - Files: `packages/supi-web/CLAUDE.md`, `packages/supi-web/README.md`
  - CLAUDE.md: update architecture tree to list `docs.ts` and `context7-client.ts`, add Context7 pipeline description, add tool contract for both tools
  - README.md: add web_docs_search / web_docs_fetch parameter tables, note about API key
  - Verification: manual read-through of both files for accuracy and consistency

- [x] **Task 8**: Full verification suite
  - Run: `pnpm vitest run packages/supi-web/`
  - Run: `pnpm exec biome check packages/supi-web/ --write`
  - Run: `pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json && pnpm exec tsc --noEmit -p packages/supi-web/__tests__/tsconfig.json`
  - All commands must pass cleanly
  - Verification: zero test failures, zero type errors, zero lint violations