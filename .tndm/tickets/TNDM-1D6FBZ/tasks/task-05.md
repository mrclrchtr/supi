# Task 5: Cut over to the clean-break tool surface, delete obsolete multiplexer files, and update docs

## Goal
Finish the clean break: register only the five focused tools, remove the old multiplexer files, and align maintainer/user docs with the new surface.

## RED
1. Update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` so it expects only `code_brief`, `code_map`, `code_relations`, `code_affected`, and `code_pattern`.
2. Update `packages/supi-code-intelligence/__tests__/unit/guidance.test.ts` so prompt surfaces no longer mention `code_intel`.
3. Run the full package verification command and confirm failures point at the old multiplexer surface.

## GREEN
1. Remove `code_intel` registration from `packages/supi-code-intelligence/src/code-intelligence.ts` and use the focused tool registration path only.
2. Delete or fully retire obsolete files once no imports remain:
   - `packages/supi-code-intelligence/src/tool/action-specs.ts`
   - `packages/supi-code-intelligence/src/tool-actions.ts`
   - `packages/supi-code-intelligence/src/actions/index-action.ts`
3. Update `packages/supi-code-intelligence/src/api.ts` and `packages/supi-code-intelligence/src/index.ts` if exported detail/result types changed.
4. Update docs in:
   - `packages/supi-code-intelligence/README.md`
   - `packages/supi-code-intelligence/CLAUDE.md`
   - `docs/tool-architecture.md`
5. Confirm `packages/supi-code-intelligence/package.json` still describes the package accurately after the public tool split; edit only if the package metadata/help text becomes stale.

## REFACTOR
- Keep the extension entrypoint thin after the cutover.
- Remove stale test names, comments, and doc examples that still talk about `code_intel` actions.
