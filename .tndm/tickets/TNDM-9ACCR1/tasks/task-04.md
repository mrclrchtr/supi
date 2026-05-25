# Task 4: Remove bundled supi-core extension from all 13 dependent packages

## Goal
Remove `"node_modules/@mrclrchtr/supi-core/src/extension.ts"` from `pi.extensions` in every SuPi package that currently bundles it. Packages keep `supi-core` in `dependencies` and `bundledDependencies` — only the extension reference is dropped.

## Files to modify (13 package.json files)
1. `packages/supi-ask-user/package.json`
2. `packages/supi-bash-timeout/package.json`
3. `packages/supi-cache/package.json`
4. `packages/supi-claude-md/package.json`
5. `packages/supi-code-intelligence/package.json`
6. `packages/supi-context/package.json`
7. `packages/supi-debug/package.json`
8. `packages/supi-extras/package.json`
9. `packages/supi-insights/package.json`
10. `packages/supi-lsp/package.json`
11. `packages/supi-rtk/package.json`
12. `packages/supi-tree-sitter/package.json`
13. `packages/supi-web/package.json`

In each file, in the `pi.extensions` array, remove the line:
```
"node_modules/@mrclrchtr/supi-core/src/extension.ts"
```

If the array becomes `["./src/extension.ts"]` (single entry), keep it on one line.

## Verification
- `pnpm install` succeeds
- Grep confirms zero matches for `supi-core/src/extension.ts` in `packages/*/package.json`
- `pnpm exec tsc -b` passes (no broken imports — packages still resolve `supi-core` as a library)
