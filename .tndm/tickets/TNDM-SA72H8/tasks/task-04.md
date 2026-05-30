# Task 4: Final verification — full package checks and interactive /supi-review smoke test

## Goal
Confirm the assembled change works end-to-end in `packages/supi-review/`, not just in the focused unit tests.

## Files
- `packages/supi-review/` (full package verification)

## Change to make
- No code changes unless a verification failure reveals a gap that must be fixed before closing the ticket.

## Verification
- Run the full package test suite:
  - `RTK_DISABLED=1 pnpm vitest run packages/supi-review/ -v`
- Run package lint/checks:
  - `pnpm exec biome check packages/supi-review`
- Run package and test typecheck:
  - `pnpm exec tsc -b packages/supi-review/tsconfig.json packages/supi-review/__tests__/tsconfig.json`
- Perform an interactive smoke test in Pi after reloading extensions:
  1. ensure there is a small local diff touching `packages/supi-review/`
  2. reload Pi so the edited extension code is active
  3. run `/supi-review`
  4. step through target/model selection until the brief preview / reviewer-prompt preview is visible
  5. confirm the preview uses the new `Mandatory review instructions` wording when the brief selected block IDs, and no stale `Audit hints` wording remains in the packet or prompt preview
- Expected result: full automated checks pass and the interactive flow reflects the new terminology/behavior.

## TDD status
Verification-only final gate.
