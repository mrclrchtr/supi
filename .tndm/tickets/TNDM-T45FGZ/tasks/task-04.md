# Task 4: Add references to non-composite source tsconfigs (10 packages)

Add `references` to 10 non-composite source tsconfigs. These packages depend on other supi packages but nobody depends on them — they stay `noEmit: true` and don't need `composite`. Adding `references` lets `tsc -b` resolve their dependency `.d.ts` files instead of re-typechecking source.

### Packages with a single reference to supi-core (9 packages)

Modify: `packages/supi-ask-user`, `supi-bash-timeout`, `supi-cache`, `supi-claude-md`, `supi-context`, `supi-debug`, `supi-extras`, `supi-insights`, `supi-rtk`, `supi-web`:
```json
{
  "extends": "../../tsconfig.json",
  "include": ["src/**/*.ts"],
  "exclude": ["__tests__"],
  "references": [{ "path": "../supi-core" }]
}
```

Note: **supi-extras** currently has no `exclude` — add `"exclude": ["__tests__"]` for consistency.

### supi-code-intelligence (3 references)

`packages/supi-code-intelligence/tsconfig.json` (depends on supi-core + supi-lsp + supi-tree-sitter):
```json
{
  "extends": "../../tsconfig.json",
  "include": ["src/**/*.ts"],
  "exclude": ["__tests__"],
  "references": [
    { "path": "../supi-core" },
    { "path": "../supi-lsp" },
    { "path": "../supi-tree-sitter" }
  ]
}
```

### Packages with no supi deps (no change)
- `supi-review` — no supi deps, no downstream dependents
- `supi-test-utils` — no supi deps, no downstream dependents

**Verification**: `pnpm exec tsc -b packages/supi-ask-user/tsconfig.json --verbose` succeeds, showing it uses supi-core's `.d.ts` output.
