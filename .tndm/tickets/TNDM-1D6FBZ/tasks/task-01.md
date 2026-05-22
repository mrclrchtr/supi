# Task 1: Introduce multi-tool specs and focused registration scaffolding

## Goal
Create the new multi-tool metadata layer and keep `packages/supi-code-intelligence/src/code-intelligence.ts` thin.

## RED
1. Update `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` to assert the new focused registration shape driven by shared specs rather than a hand-written `code_intel` definition.
2. Update `packages/supi-code-intelligence/__tests__/unit/guidance.test.ts` to assert the new prompt-surface contract derived from tool specs.
3. Run the targeted test command and confirm it fails for the expected registration/guidance reasons.

## GREEN
1. Add `packages/supi-code-intelligence/src/tool/tool-specs.ts` as the single source of truth for the new public tools (`code_brief`, `code_map`, `code_relations`, `code_affected`, `code_pattern`), including exact names, descriptions, snippets, base guidance, and parameter schemas.
2. Add `packages/supi-code-intelligence/src/tool/register-tools.ts` to register tools from those specs.
3. Rewrite `packages/supi-code-intelligence/src/tool/guidance.ts` to derive prompt surfaces from `tool-specs.ts` instead of `action-specs.ts`.
4. Update `packages/supi-code-intelligence/src/code-intelligence.ts` so it keeps only overview injection + tool registration wiring.

## REFACTOR
- Keep the final public cutover for the old `code_intel` name in the last task if intermediate wiring needs a short-lived bridge during implementation, but do not leave duplicated metadata paths behind.
- Prefer shared helper functions for repeated tool-result boilerplate rather than reintroducing a large switch statement.
