## 1. Core Implementation

- [x] 1.1 Add `cwd` parameter to `readNativeContextFiles` in `refresh.ts` and filter out files resolved outside cwd using `path.relative`
- [x] 1.2 Update call site in `index.ts` `before_agent_start` handler to pass `_ctx.cwd` to `readNativeContextFiles`

## 2. Tests

- [x] 2.1 Add unit tests for `readNativeContextFiles` filtering: home-dir file excluded, project file included, subproject file included, missing path/content excluded
- [x] 2.2 Update existing `readNativeContextFiles` tests that call it without `cwd` to pass the new parameter
- [x] 2.3 Verify with `pnpm vitest run packages/supi-claude-md/` and `pnpm typecheck`

## 3. Lint & Verify

- [x] 3.1 Run `pnpm exec biome check --write packages/supi-claude-md/` then `pnpm verify`
