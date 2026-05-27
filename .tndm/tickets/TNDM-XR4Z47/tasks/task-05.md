# Task 5: Fix target store: re-fingerprint unfingerprinted entries on lookup, handle missing files

## Goal

When a file can't be fingerprinted at registration time, the store uses `"unfingerprinted"` as a placeholder. At lookup, staleness is only checked when the fingerprint is NOT `"unfingerprinted"`. If the backing file is later deleted or unreadable, `getWorkflowTarget()` still returns `available`.

## Files

- `packages/supi-code-intelligence/src/workflow/target-store.ts` (lines 162-166, 231-242)

## Change

At lookup time (`getWorkflowTarget`), when `entry.fileFingerprint === "unfingerprinted"`:
1. Call `computeFileFingerprint(entry.file)` again.
2. If it returns `kind: "ok"`, update the stored fingerprint and compare — if it doesn't match, mark as stale.
3. If it returns `kind: "error"` (file gone/unreadable), mark as unavailable.

Also consider: should `registerWorkflowTarget()` reject unreadable files outright? The current design allows it (tests register targets for non-existent files). Keep backward compatibility in `registerWorkflowTarget` but handle the case at lookup time.

## TDD

1. Add test: register a target with a real file, then delete the file, then lookup → returns `unavailable`.
2. Add test: register a target with a real file, lookup succeeds, modify the file, lookup → returns `unavailable` (already tested, verify existing stale test passes).
3. Add test: register a target with a non-existent file (current behavior: fingerprint = `"unfingerprinted"`), then lookup → returns `unavailable` since file still doesn't exist.

## Verification

- New tests pass
- Existing target-store tests still pass (stale detection, cwd isolation, etc.)

