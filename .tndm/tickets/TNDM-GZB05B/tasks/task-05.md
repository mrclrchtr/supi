# Task 5: Migrate supi-code-intelligence and supi-tree-sitter (project + path + types + session domains)

Update import sites in 2 packages that heavily use project roots, path utilities, and types.

### supi-code-intelligence (7 files)
- `src/architecture.ts`: `{ findProjectRoot, isWithinOrEqual, walkProject }` → from `"@mrclrchtr/supi-core/project"`
- `src/prioritization-signals.ts`: `{ readJsonFile }` → from `"@mrclrchtr/supi-core/config"`
- `src/search-helpers.ts`: `{ resolveToolPath, uriToFile as uriToFileShared }` → from `"@mrclrchtr/supi-core/path"`
- `src/substrates/lsp-adapter.ts`: `type { CodeLocation, CodePosition }` → from `"@mrclrchtr/supi-core/types"`
- `src/substrates/types.ts`: `type { CodeLocation, CodePosition }` → from `"@mrclrchtr/supi-core/types"`
- `src/targeting/resolve-symbol.ts`: `{ isWithinOrEqual }` → from `"@mrclrchtr/supi-core/project"`
- `__tests__/unit/semantic-references.test.ts`: `type { CodeLocation, CodePosition }` → from `"@mrclrchtr/supi-core/types"`

### supi-tree-sitter (2 files)
- `src/session/runtime.ts`: `{ resolveToolPath }` → from `"@mrclrchtr/supi-core/path"`
- `src/session/service-registry.ts`: `{ createSessionStateRegistry }` → from `"@mrclrchtr/supi-core/session"`

### Verification
- `tsc -b` must pass for both packages
- `pnpm test --filter @mrclrchtr/supi-code-intelligence --filter @mrclrchtr/supi-tree-sitter` — all tests must pass
