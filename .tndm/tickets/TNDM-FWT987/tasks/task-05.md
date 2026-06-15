# Task 5: Rewrite context7-client unit tests — mock fetch instead of SDK

## Goal

Replace SDK class mocks with `globalThis.fetch` mocks. Test the direct REST API behavior: auth headers, error parsing, field mapping.

## File

`packages/supi-web/__tests__/unit/context7-client.test.ts`

## Changes

1. Remove `vi.mock("@upstash/context7-sdk", ...)` block
2. Remove `mockSearchLibrary`, `mockGetContext`, `MockContext7Error` from `vi.hoisted`
3. Add `mockFetch` in `vi.hoisted` via `vi.hoisted(() => ({ mockFetch: vi.fn() }))`
4. Add `vi.stubGlobal("fetch", mockFetch)` in `beforeEach`
5. Rewrite test cases:

**searchLibrary tests:**
- Returns mapped search results → mock fetch to return 200 with JSON body containing `{ results: [...] }`, verify mapped fields (especially `title` → `name`)
- Returns empty array for no results → mock fetch with `{ results: [] }`
- Propagates error on non-ok response → mock fetch with status 401/404/429, verify `Context7Error` thrown
- Propagates network error → mock fetch rejection, verify error thrown

**getContext tests:**
- Returns text for default mode → mock fetch with 200 + text body
- Returns snippets for raw mode → same endpoint, verify response is passed through
- Propagates Context7Error on non-ok response

## Verification

- `pnpm vitest run packages/supi-web/__tests__/unit/context7-client.test.ts` — all tests pass (GREEN)
- Run tests without CONTEXT7_API_KEY set to confirm test environment doesn't need it
