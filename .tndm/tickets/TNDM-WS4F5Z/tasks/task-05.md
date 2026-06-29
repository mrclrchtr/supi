# Task 5: Final verification — tests, typecheck, lint, and rename-only wording audit

# Task 5: Final verification — tests, typecheck, lint, and rename-only wording audit

## Goal

Confirm the generalized first-wave refactor behavior works end-to-end across the touched packages.

## Files

- No source edits required unless verification reveals a real defect.

## Verification

1. Run the full targeted test sweep:

```bash
RTK_DISABLED=1 pnpm vitest run \
  packages/supi-code-runtime/ \
  packages/supi-lsp/ \
  packages/supi-code-intelligence/ -v
```

2. Run the full targeted typecheck sweep:

```bash
pnpm exec tsc -b \
  packages/supi-code-runtime/tsconfig.json \
  packages/supi-code-runtime/__tests__/tsconfig.json \
  packages/supi-lsp/tsconfig.json \
  packages/supi-lsp/__tests__/tsconfig.json \
  packages/supi-code-intelligence/tsconfig.json \
  packages/supi-code-intelligence/__tests__/tsconfig.json
```

3. Run Biome on the touched packages:

```bash
pnpm exec biome check \
  packages/supi-code-runtime/ \
  packages/supi-lsp/ \
  packages/supi-code-intelligence/ --max-diagnostics=30
```

4. Confirm the old hard-coded rename-only error is gone:

```bash
rg -n 'Currently only "rename" is supported' \
  packages/supi-code-runtime \
  packages/supi-lsp \
  packages/supi-code-intelligence
```

Expected result: no matches.

5. Confirm the final behavior set is covered by tests and docs:
   - `rename_symbol` works
   - legacy `rename` alias still works
   - `update_imports` works when the provider returns precise edits
   - `delete_dead_code` works when the provider returns precise edits
   - `rename_file` / `move_file` fail explicitly and honestly

This task is the integration gate for the whole change.
