# Archive

## Verification Evidence

### Fresh runs (2026-06-16)

**TypeScript**: clean — `tsc -b packages/supi-web/tsconfig.json packages/supi-web/__tests__/tsconfig.json` — no errors.

**Lint**: clean — `biome check packages/supi-web/` — 20 files, no fixes applied.

**Unit tests (su G‑web)**: 86 passed, 0 failed.

**Smoke test (no API key)**: `CONTEXT7_API_KEY= pnpm exec jiti` imports `docs.ts` → prints "Module loaded OK" — no crash, no "API key is required" error.

**Full workspace verify**: `pnpm verify:ai` — 1839 tests passed (189 files), all 18 packages pack-verified.

### Live tool test (reloaded PI)

- `web_docs_search` — returned 5 React libraries with correct `title → Name` column mapping.
- `web_docs_fetch` — returned up-to-date useState examples from `/reactjs/react.dev`.

### Changes

| File | Change |
|---|---|
| `packages/supi-web/src/context7-client.ts` | Rewritten: direct REST API via fetch(), optional auth headers, error parsing |
| `packages/supi-web/package.json` | Removed `@upstash/context7-sdk` dependency |
| `packages/supi-web/README.md` | Corrected API key guidance |
| `packages/supi-web/CLAUDE.md` | Updated pipeline docs, removed SDK references, corrected key guidance |
| `packages/supi-web/__tests__/unit/context7-client.test.ts` | Rewritten: 13 tests against fetch() mocks |
| `pnpm-lock.yaml` | Updated automatically
