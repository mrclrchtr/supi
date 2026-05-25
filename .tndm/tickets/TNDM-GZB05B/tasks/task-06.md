# Task 6: Migrate supi-lsp import sites (multi-domain: config + context + project + session + settings + terminal + path)

supi-lsp has the most import sites (15 files) and uses the widest range of supi-core domains. Map each to its new subpath.

### supi-lsp source files (10 files)
- `src/config/config.ts`: `{ loadSupiConfigForScope }` → from `"@mrclrchtr/supi-core/config"`
- `src/utils.ts`: `{ fileToUri, ... }` (multi-line block) → split: path symbols from `"@mrclrchtr/supi-core/path"`, any remaining from appropriate domain
- `src/handlers/diagnostic-injection.ts`: `{ pruneAndReorderContextMessages, restorePromptContent }` → from `"@mrclrchtr/supi-core/context"`
- `src/manager/manager.ts`: `* as projectRoots` → from `"@mrclrchtr/supi-core/project"`
- `src/manager/manager-helpers.ts`: `* as projectRoots` → from `"@mrclrchtr/supi-core/project"`
- `src/manager/manager-workspace-symbol.ts`: `{ walkProject }` → from `"@mrclrchtr/supi-core/project"`
- `src/session/scanner.ts`: `{ dedupeTopmostRoots, walkProject }` → from `"@mrclrchtr/supi-core/project"`
- `src/session/service-registry.ts`: `{ createSessionStateRegistry }` → from `"@mrclrchtr/supi-core/session"`
- `src/session/settings-registration.ts`: `{ registerSettings, getRegisteredSettings, ... }` (multi-line) → from `"@mrclrchtr/supi-core/settings"`

### supi-lsp test files (5 files)
- `__tests__/unit/guidance.test.ts`: `{ pruneAndReorderContextMessages }` → from `"@mrclrchtr/supi-core/context"`
- `__tests__/unit/scanner.test.ts`: `{ dedupeTopmostRoots }` → from `"@mrclrchtr/supi-core/project"`
- `__tests__/unit/utils.test.ts`: `{ findProjectRoot }` → from `"@mrclrchtr/supi-core/project"`
- `__tests__/unit/settings-registration.test.ts`: `{ getRegisteredSettings, clearRegisteredSettings, ... }` (multi-line) → from `"@mrclrchtr/supi-core/settings"`

### Verification
- `tsc -b packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json` must pass
- `pnpm test --filter @mrclrchtr/supi-lsp` — all tests must pass
