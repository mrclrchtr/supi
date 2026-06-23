# Task 1: Add a shared session-state registry helper to supi-core

## Goal
Create a minimal reusable helper in `packages/supi-core/` for session-scoped state keyed by normalized `cwd`, backed by `globalThis` + `Symbol.for(...)`, without changing the existing generic `createRegistry()` behavior.

## Changes
- Extend `packages/supi-core/src/registry-utils.ts` with a dedicated helper such as `createSessionStateRegistry<TState>(name)` that exposes `get(cwd)`, `set(cwd, state)`, and `clear(cwd)`.
- Keep normalized-`cwd` keying inside the helper so callers do not duplicate `path.resolve(cwd)` logic.
- Export the helper from `packages/supi-core/src/api.ts` and `packages/supi-core/src/index.ts`.
- Add `packages/supi-core/__tests__/unit/registry-utils.test.ts` to cover:
  - storing/retrieving state by cwd
  - normalized cwd aliasing (`/tmp/x` vs `/tmp/../tmp/x`-style equivalents)
  - clearing one cwd without affecting another
  - global symbol sharing behavior across module reloads, matching the existing jiti-safe registry pattern

## TDD
1. Write the new registry-utils unit test first.
2. Run `pnpm vitest run packages/supi-core/__tests__/unit/registry-utils.test.ts -v` and confirm it fails for the missing helper or missing normalization behavior.
3. Implement the helper and exports.
4. Re-run the verification command until the test and typechecks pass.
