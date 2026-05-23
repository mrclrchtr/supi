## Problem

When new source files are created or workspace changes occur, existing files that import from them can show stale "Cannot find module" diagnostics (TS 2307) that persist through `lsp recover` calls.

### Observed symptoms (from TNDM-546NEK)
1. Create `QuantityBarCell.test.tsx` which imports `./QuantityBarCell`
2. Diagnostic: `Cannot find module './QuantityBarCell'` (expected — file doesn't exist yet)
3. Create `QuantityBarCell.tsx` — module now exists
4. `lsp recover` → reports success but diagnostic persists
5. Actual build/test tools pass (`pnpm typecheck:ai`, vitest)
6. Only cleared after a subsequent edit triggers re-analysis

### Root cause analysis
1. `write`/`edit` → `syncFileAndGetCascadingDiagnostics` → sends `didOpen` for new files — works fine for the new file itself
2. TypeScript server does **not re-diagnose already-open files** when new files appear in the project
3. Cascade detection in `syncClientFileAndGetCascadingDiagnostics` only catches files that receive **new** `publishDiagnostics` notifications — doesn't re-sync files whose imports may now resolve differently
4. `assessStaleDiagnostics` threshold requires **≥3 files** with TS 2307 errors before triggering a client restart. With ≤2 affected files, recovery stays in soft-recovery mode which is insufficient

## Current recovery pipeline

SuPi-LSP already has: workspace sentinel rescanning, missing-file pruning, diagnostic refresh, and force-reopen for stale module-resolution diagnostics. But stale diagnostics can survive long enough to be shown inline after write/edit or across turns.

## Desired improvements

1. **Immediate second-pass stale recovery** after successful write/edit before final inline diagnostics are shown.
2. **Recovery ladder** — escalate from soft recovery + reopen → `restartIfStillStale` when the stale diagnostic fingerprint persists after workspace changes.
3. **Broader change triggers** — trigger recovery beyond sentinel files to include source-file create/delete churn where practical.
4. **Improved user-facing messaging** — distinguish suspected stale state from real errors in diagnostic output.
5. **Lower stale-assessment threshold** — reduce `assessStaleDiagnostics` threshold from ≥3 to ≥1, or remove it entirely (risk: unnecessary server restarts for genuine missing modules).
6. **Re-sync affected open files after new file creation** — after `write` creates a new source file, identify open files that might import from it and explicitly re-sync them.
7. **Hard recovery action** — add `lsp recover --hard` or equivalent that bypasses stale assessment and directly restarts the client unconditionally.
8. **Improve cascade detection with resultId tracking** — after clearing pull result IDs, actively wait for re-diagnosis notifications for all open files, not just the synced file.

## Key constraints

- Don't break existing recovery flow for other cases (install, config changes)
- Avoid restarting the LSP client unnecessarily (can cause noticeable delay)
- Handle the single-/dual-file stale-diagnostic case that the current threshold misses
- Pi sessions only — external editor/harness LSPs are out of scope

## Related

- Supersedes **TNDM-546NEK** (original bug report — May 14)
- Supersedes **TNDM-WASNR8** (original design brief — May 17)