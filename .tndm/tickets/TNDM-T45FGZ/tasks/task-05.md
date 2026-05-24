# Task 5: Add references to test tsconfigs (15 packages)

Add `references` to test tsconfigs pointing to their source package's supi dependencies. Test tsconfigs keep direct `../src/**/*.ts` inclusion (needed for non-exported symbol access in tests) and only reference OTHER packages' source tsconfigs — never their own.

### Standard pattern (single supi-core reference, 11 packages)

For: `supi-ask-user`, `supi-cache`, `supi-claude-md`, `supi-context`, `supi-debug`, `supi-extras`, `supi-insights`, `supi-lsp`, `supi-rtk`, `supi-tree-sitter`, `supi-web`

Path: `packages/<pkg>/__tests__/tsconfig.json`
Reference: `../../supi-core`

Template:
```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "include": ["**/*.ts", "../src/**/*.ts"],
  "exclude": [],
  "references": [{ "path": "../../supi-core" }]
}
```

Edge cases:
- **supi-debug** tsconfig has specific includes (`"unit/**/*.ts", "integration/**/*.ts", ...`) — preserve those exact includes, just add references
- **supi-extras** tsconfig similarly has specific includes — preserve them

### supi-code-intelligence (3 references)

`packages/supi-code-intelligence/__tests__/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "include": ["**/*.ts", "../src/**/*.ts"],
  "exclude": [],
  "references": [
    { "path": "../../supi-core" },
    { "path": "../../supi-lsp" },
    { "path": "../../supi-tree-sitter" }
  ]
}
```

### supi-bash-timeout (nested test dir)

`packages/supi-bash-timeout/__tests__/unit/tsconfig.json` (extends one extra level):
Reference: `../../../supi-core`
```json
{
  "extends": "../../../../tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "include": ["**/*.ts", "../../src/**/*.ts"],
  "exclude": [],
  "references": [{ "path": "../../../supi-core" }]
}
```

### No changes (3 packages)

- **supi-core** — no supi deps, tests only depend on external packages (`@earendil-works/pi-*`)
- **supi-review** — no supi deps
- **supi-test-utils** — no test files, no supi deps

**Verification**: `tsc -b packages/*/__tests__/tsconfig.json --verbose` succeeds, showing dependency `.d.ts` resolution.
