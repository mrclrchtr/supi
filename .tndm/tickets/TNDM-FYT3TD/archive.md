# Archive

## Verification Results

### New Package: `packages/supi-web/`
- **TypeScript**: `pnpm exec tsc --noEmit -p packages/supi-web/tsconfig.json` ✅ clean
- **Tests**: `pnpm vitest run packages/supi-web/ -v` ✅ 27 tests passed (3 files)
- **Biome**: `pnpm exec biome check packages/supi-web/` ✅ clean

### Meta-package Integration
- **TypeScript**: `pnpm exec tsc --noEmit -p packages/supi/tsconfig.json` ✅ clean
- `packages/supi/package.json` updated with `@mrclrchtr/supi-web` in `dependencies` + `bundledDependencies`
- `packages/supi/src/web.ts` wrapper created
- `pi.extensions` array updated

### Cleanup
- `.agents/skills/web-fetch-to-markdown/` removed entirely
- `skills-lock.json` updated to remove `web-fetch-to-markdown` entry

### Files Created
- `packages/supi-web/package.json`
- `packages/supi-web/tsconfig.json`
- `packages/supi-web/__tests__/tsconfig.json`
- `packages/supi-web/src/web.ts` — extension factory registering `web_fetch_md` tool
- `packages/supi-web/src/fetch.ts` — HTTP content negotiation (HEAD, sniff, sibling probe, full GET)
- `packages/supi-web/src/convert.ts` — HTML→Markdown via JSDOM + Readability + Turndown
- `packages/supi-web/src/temp-file.ts` — temp file writing for large content
- `packages/supi-web/src/index.ts` — public exports
- `packages/supi-web/__tests__/fetch.test.ts`
- `packages/supi-web/__tests__/convert.test.ts`
- `packages/supi-web/__tests__/web.test.ts`
- `packages/supi/src/web.ts`

### Files Modified
- `packages/supi/package.json`
- `skills-lock.json`

### Tool Contract: `web_fetch_md`
| Param | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | required | http(s) URL to fetch |
| `output_mode` | `"auto" \| "inline" \| "file"` | `"auto"` | Auto = inline if ≤15K chars, else temp file |
| `abs_links` | `boolean` | `true` | Absolutize relative links/images |
| `timeout_ms` | `number` | `30000` | Fetch timeout in ms |

Note: Full `pnpm verify` has pre-existing failures in unrelated packages (supi-cache, supi-extras, etc.) that existed before this change.
