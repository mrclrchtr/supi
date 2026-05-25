# Task 1: Create the architecture doc and scaffold packages/supi-code-runtime

## Goal
Create the greenfield architecture note and a compilable shared-runtime package skeleton so later phases can land behind a stable package boundary.

## Files
- `docs/code-runtime-architecture.md`
- `packages/supi-code-runtime/package.json`
- `packages/supi-code-runtime/README.md`
- `packages/supi-code-runtime/CLAUDE.md`
- `packages/supi-code-runtime/tsconfig.json`
- `packages/supi-code-runtime/__tests__/tsconfig.json`
- `packages/supi-code-runtime/src/api.ts`
- `packages/supi-code-runtime/src/index.ts`
- `packages/supi-code-runtime/src/types.ts`
- `packages/supi-code-runtime/src/provider/types.ts`
- `packages/supi-code-runtime/src/session/service-registry.ts`
- `packages/supi-code-runtime/src/session/workspace-session.ts`
- `release-please-config.json`

## Change
- Add `docs/code-runtime-architecture.md` with the approved target architecture, provider boundaries, compatibility rules, and migration order from this ticket.
- Create `packages/supi-code-runtime/` as a library-style package boundary that follows the repo package-layout convention: reusable `src/api.ts` / `src/index.ts`, package-level tests, and no pi tool surface of its own.
- Set up `packages/supi-code-runtime/package.json` so the package is consumable by other SuPi packages, exposes `./api`, and participates in release version syncing via `release-please-config.json`.
- Add only minimal compilable scaffolding in the new source files; do not implement provider behavior in this task.
- Run `pnpm install` after adding the new package manifest so workspace dependency metadata and lockfile state are correct before later TypeScript edits.

## Verification
Test-exempt rationale: this phase is package scaffolding plus architecture documentation; there is no meaningful runtime behavior to drive red-green yet.

Run:
- `pnpm install`
- `pnpm exec tsc --noEmit -p packages/supi-code-runtime/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-code-runtime/__tests__/tsconfig.json`
- `pnpm exec biome check docs/code-runtime-architecture.md packages/supi-code-runtime release-please-config.json`

Expected result: all commands exit 0 and the new package compiles as an empty-but-valid workspace package.
