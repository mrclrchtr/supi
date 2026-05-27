# Task 3: Align public code_resolve schema with workflow schema (enum kind, minimum line/character)

## Goal

The active `code_resolve` tool spec in `tool-specs.ts` uses plain `Type.String` for `kind` and unconstrained `Type.Number` for line/character. The workflow schema in `schemas.ts` already has the correct constraints: `StringEnum` with allowed kind values and `minimum: 1` on line/character.

## Files

- `packages/supi-code-intelligence/src/tool/tool-specs.ts` (lines 14-17, 131-151)
- `packages/supi-code-intelligence/src/workflow/schemas.ts`

## Change

Option A (preferred): make `LineParam` and `CharacterParam` include `minimum: 1`, and replace the inline `Type.String` for kind with `StringEnum` mirroring the workflow schema.

Option B: directly reuse `CodeResolveParameters` from `schemas.ts` in `tool-specs.ts` to eliminate the drift entirely.

Choose A as the smaller change that keeps `tool-specs.ts` self-contained. Add `minimum: 1` to `LineParam` and `CharacterParam`, and use `StringEnum` for the kind field matching the workflow schema's allowed values.

Also verify this doesn't break any existing tests that may pass `line: 0` through deliberately.

## TDD

This is a schema constraint change. No new logic tests needed — existing tests validate the runtime behavior. The TypeBox schema change is verified by:
1. Existing `code_resolve` tests still pass
2. Full package typecheck passes
3. New test: `tool-specs.test.ts` (or inline in extension-registration) validates the parameter shape has `minimum` on line/character and enum on kind

## Verification

- Existing tests pass
- TypeBox rejects invalid kinds at the schema layer (runtime tests if a test harness exists)
- Typecheck passes

