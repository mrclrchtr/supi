# Task 5: Update supi-review docs for the new triage model and deterministic audits

## Goal
Bring user-facing and maintainer-facing docs in line with the redesigned review-item contract, host-derived verdict rules, structured fix guidance, and deterministic audit hints.

## Files
- `packages/supi-review/README.md`
- `packages/supi-review/CLAUDE.md`

## Changes
1. Update `packages/supi-review/README.md` to describe:
   - the new review-item shape and richer triage fields
   - host-derived binary verdicts
   - structured `suggested_fix` / `verification_hint`
   - deterministic audit hints in the compact reviewer packet
   - unchanged fixed follow-up options after a review completes
2. Update `packages/supi-review/CLAUDE.md` to document:
   - the new schema/types terminology
   - `src/review-result.ts` as the normalization source of truth
   - `src/target/audit-hints.ts` and the four audit families
   - the rule that verdicts are derived by the host, not trusted from the model
3. Remove or rewrite any stale references to legacy `priority` / severity branching in the package docs.

## Verification
This is a docs task, so it is test-exempt.

Run:

```bash
pnpm exec biome check packages/supi-review/README.md packages/supi-review/CLAUDE.md
```

Then manually review both files and confirm they match the approved design and current source responsibilities.

Expected result: Biome is clean and the docs accurately describe the new contract with no stale `priority` guidance.

## Test exemption rationale
Docs-only task. The behavior is already covered by code/tests in earlier tasks; this task verifies documentation accuracy and consistency.
