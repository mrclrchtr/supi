# Task 3: Update code_find public docs and metadata assertions for AST call support

## Goal
Remove stale public guidance and lock the public metadata contract so users and agents see `call` as a supported AST kind everywhere.

## Files
- Modify `packages/supi-code-intelligence/README.md`
- Modify `packages/supi-code-intelligence/CLAUDE.md`
- Modify `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`

## Changes
1. In `packages/supi-code-intelligence/README.md`:
   - Update the `code_find` section so supported AST kinds are exactly `definition`, `import`, `export`, and `call`.
   - Ensure unsupported AST kinds `type` and `test` are not described as supported.
2. In `packages/supi-code-intelligence/CLAUDE.md`:
   - Make the same supported-kind update for maintainer/agent guidance.
3. In `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`:
   - Strengthen the `code_find` registration test to assert tool description, prompt guidelines, and `kind` parameter description all include `call` alongside `definition`, `import`, and `export`.
   - Keep assertions that `type` and `test` are absent from the schema enum.

## Verification
Run:

```bash
set -v
RTK_DISABLED=1 pnpm -s vitest run packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts --reporter=verbose
rg -n 'supported AST kinds|definition`, `import`, `export`|definition.*import.*export.*call|unsupported kind' packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md packages/supi-code-intelligence/src packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts
```

Expected result:
- Vitest passes.
- The `rg` output shows no stale user-facing supported-kind list that omits `call`.

## Test mode
Mixed. The metadata assertion is test-driven. The Markdown updates are test-exempt because they are documentation-only; manual verification is the `rg` command above.
