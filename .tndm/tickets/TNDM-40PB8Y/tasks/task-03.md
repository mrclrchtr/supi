# Task 3: Update supi-review docs for the new in-app preview inspector

## Goal
Update user-facing and maintainer-facing docs so they match the new preview behavior and file layout.

## Files
- `packages/supi-review/README.md`
- `packages/supi-review/CLAUDE.md`

## Change
- Update `packages/supi-review/README.md` to describe the in-app review-plan inspector, the Overview-first default, the Raw Prompt mode, and the export fallback.
- Update `packages/supi-review/CLAUDE.md` to include `packages/supi-review/src/ui/review-plan-inspector.ts` in the package structure and to note that full preview no longer relies on an external pager.
- Keep the docs limited to the changed behavior and file layout; do not add unrelated cleanup.

## Verification
1. Read the changed sections in both files and confirm the documented shortcuts and behavior match the implemented UI.
2. Optional grep aid:
   - `rg "inspector|Raw Prompt|export|less|review-plan-inspector" packages/supi-review/README.md packages/supi-review/CLAUDE.md`
   - Expected result: the docs mention the new inspector behavior and no longer describe the external pager as the primary path.

## Test strategy
Test-exempt.
Rationale: documentation-only changes.
