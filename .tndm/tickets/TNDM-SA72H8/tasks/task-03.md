# Task 3: Update supi-review docs for brief-selected mandatory review instructions

## Goal
Bring package docs and architecture notes in sync with the new design so they describe brief-selected instruction blocks instead of host-deterministic audit-hint derivation.

## Files
- `packages/supi-review/README.md`
- `packages/supi-review/CLAUDE.md`

## Change to make
- Update README sections that currently describe deterministic audit-hint derivation so they instead describe:
  - the fixed instruction-block catalog
  - brief-selected block IDs in the synthesized brief
  - packet rendering of mandatory review instructions
- Update `CLAUDE.md` architecture notes, design decisions, and gotchas to remove stale references to `audit hints` / deterministic host derivation and to document the new brief-owned selection model.
- Keep terminology consistent with implementation: `review instruction blocks` and `mandatory review instructions`.

## Verification
- This task is **test-exempt** because it is docs-only.
- Rationale: README/architecture-note wording changes do not have a meaningful automated harness.
- Verify with targeted searches and manual read-through:
  - `rg -n "audit hints|deterministic audit" packages/supi-review/README.md packages/supi-review/CLAUDE.md`
  - `rg -n "mandatory review instructions|instruction block|reviewInstructionBlockIds" packages/supi-review/README.md packages/supi-review/CLAUDE.md`
- Expected result: stale architectural claims are removed or intentionally rewritten, and the new terminology appears in the relevant sections.

## TDD status
Test-exempt for docs-only work.
