# Task 2: Promote stable Tree-sitter library APIs for external session orchestration

## Goal
Create a stable, pi-independent Tree-sitter runtime surface that `packages/supi-code-intelligence` can consume through `@mrclrchtr/supi-tree-sitter/api`.

## Changes
1. Add `packages/supi-tree-sitter/src/session/runtime-controller.ts` as the new session-scoped controller.
   - It should own runtime creation/disposal for one cwd.
   - It should publish and clear the shared `SessionTreeSitterService` state.
   - It should expose the ready/unavailable lifecycle in a way the umbrella adapter can reuse without importing `src/tree-sitter.ts`.
2. Export the controller from `packages/supi-tree-sitter/src/api.ts` and `packages/supi-tree-sitter/src/index.ts`.
3. Keep `packages/supi-tree-sitter/src/session/session.ts` and `packages/supi-tree-sitter/src/session/service-registry.ts` as the shared runtime primitives behind the new controller.
4. Keep the existing `packages/supi-tree-sitter/src/tree-sitter.ts` extension working until the later cleanup task removes it.

## Test plan
- Add `packages/supi-tree-sitter/__tests__/runtime-controller.test.ts` first and make it fail for the missing controller behavior.
- Update `packages/supi-tree-sitter/__tests__/service-registry.test.ts` and `packages/supi-tree-sitter/__tests__/session.test.ts` as needed so the new public controller contract is covered.
