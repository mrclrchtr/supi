# Task 1: Rewrite context7-client.ts — drop SDK, use direct REST API

## Goal

Replace the `@upstash/context7-sdk` based client with direct `fetch()` calls to the Context7 REST API, matching the official pi extension pattern.

## File

`packages/supi-web/src/context7-client.ts`

## Changes

1. Remove `import { Context7, Context7Error } from "@upstash/context7-sdk"`
2. Remove `const client = new Context7()` (the module-level statement that causes the crash)
3. Add `BASE_URL = "https://context7.com/api"`
4. Add `authHeaders()` — returns `{ Authorization: "Bearer <key>" }` if `CONTEXT7_API_KEY` is set, otherwise `{}`
5. Add `parseErrorResponse(response: Response, hasKey: boolean): Promise<string>` — handles 401, 404, 429, and generic errors with helpful messages matching upstream
6. Rewrite `searchLibrary(query, libraryName)` — calls `GET /v2/libs/search?query=...&libraryName=...`, returns `SearchResult[]`
7. Rewrite `getContext(query, libraryId, raw?)` — calls `GET /v2/context?query=...&libraryId=...`, returns `string | DocSnippet[]`
8. Remove `Context7Error` re-export (or keep a local `Context7Error` class if `docs.ts` references it in `instanceof` checks)
9. Update `SearchResult` interface: API responds with `title` instead of `name` — map `result.title` to the `name` field used by `docs.ts` for the markdown table

## Verification

- Run `pnpm vitest run packages/supi-web/__tests__/unit/context7-client.test.ts` — tests fail (RED, no test changes yet)
- Run `pnpm exec tsc -b packages/supi-web/tsconfig.json` — typecheck passes
