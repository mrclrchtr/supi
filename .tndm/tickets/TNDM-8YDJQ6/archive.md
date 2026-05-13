# Archive

## Verification Results

### Deviation from plan
- **Task 8** (supi-lsp e2e smoke test): Kept local mock. The 900+ line integration test uses single-handler access throughout (`pi.handlers.get("event")!()`) and the shared factory's multi-handler arrays would require rewriting the entire test suite. The shared factory is used by all 9 other migrated packages.

### Test results (fresh, all 64 files)
- supi-bash-timeout: 3/3 passed
- supi-cache: 11/11 passed
- supi-claude-md: 10/10 passed
- supi-code-intelligence: 14/14 passed
- supi-context: 4/4 passed
- supi-debug: 2/2 passed
- supi-extras: 6/6 passed
- supi-rtk: 4/4 passed
- supi-tree-sitter: 10/10 passed

### TypeScript typecheck (fresh)
- `pnpm typecheck:tests` — 0 errors across all test tsconfigs

### Biome (fresh)
- `pnpm exec biome check packages/supi-test-utils/` — No fixes applied

### Summary
9 packages migrated from local factories to shared `@mrclrchtr/supi-test-utils`. ~30 local `createPiMock`/`makeCtx` definitions deleted. One source of truth for `ExtensionAPI` and `ExtensionCommandContext` mocks. Future type migrations require updating only the factory file.
