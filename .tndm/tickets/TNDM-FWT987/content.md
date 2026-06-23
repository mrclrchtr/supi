## Problem

`packages/supi-web/src/context7-client.ts` calls `new Context7()` at module load time. The `@upstash/context7-sdk` constructor throws `"API key is required..."` when `CONTEXT7_API_KEY` is missing. This crashes PI startup entirely.

GitHub issue: https://github.com/mrclrchtr/supi/issues/110

## Approach: Drop SDK, use direct REST API

Drop `@upstash/context7-sdk` and call the Context7 REST API directly via `fetch()`, matching the [official Context7 pi extension](https://github.com/upstash/context7/tree/master/packages/pi) pattern.

```ts
function authHeaders(): Record<string, string> {
  const apiKey = process.env.CONTEXT7_API_KEY;
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}
```

No key → no Authorization header → request still fires, errors surface as tool results at execute time, never at load time.

## Files

| File | Change |
|---|---|
| `packages/supi-web/src/context7-client.ts` | Rewrite: remove SDK, add direct REST calls |
| `packages/supi-web/src/docs.ts` | Minimal — existing catch blocks already handle errors |
| `packages/supi-web/package.json` | Remove `@upstash/context7-sdk` from dependencies |
| `packages/supi-web/README.md` | Correct API key guidance |
| `packages/supi-web/CLAUDE.md` | Correct API key guidance |
| `packages/supi-web/__tests__/unit/context7-client.test.ts` | Rewrite: mock `fetch` instead of SDK |
| `packages/supi-web/__tests__/unit/docs.test.ts` | Update mocks |

## API endpoints

- Search: `GET https://context7.com/api/v2/libs/search?query=...&libraryName=...`
- Fetch: `GET https://context7.com/api/v2/context?query=...&libraryId=...`

## Field mapping

API responds with `title` (old SDK gave `name`). Markdown table header stays `Name` but maps from `result.title`.

## Error handling

| Status | Message |
|---|---|
| 401 | Invalid API key |
| 404 | Library does not exist |
| 429 | Rate limit (message differs based on whether key is set) |
| Other | Generic status-based message |

All returned as `{ isError: true }` tool results — never thrown at load time.

## Non-goals

- Not changing tool names, parameter shapes, or prompt guidance
- Not changing the markdown table output format
- Not adding new features
