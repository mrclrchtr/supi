## Design Brief

### Problem
When new source files are created in `packages/supi-review/` (e.g. `briefs.ts`, `profiles.ts`), existing test files that import from them (`briefs.test.ts`, `prompts.test.ts`) continue to show stale "Cannot find module" diagnostics (TS 2307). The existing recovery pipeline doesn't resolve these.

### Root cause analysis
1. `write`/`edit` → `syncFileAndGetCascadingDiagnostics` → sends `didOpen` for new files — works fine for the new file itself
2. But the TypeScript server **does not re-diagnose already-open files** (`briefs.test.ts`) when new files appear in the project
3. The cascade detection in `syncClientFileAndGetCascadingDiagnostics` only catches files that receive **new** `publishDiagnostics` notifications — it doesn't re-sync files whose imports may now resolve differently
4. The stale-assessment escalation threshold in `assessStaleDiagnostics` requires **≥3 files** with TS 2307 errors before triggering a client restart. With ≤2 affected files, recovery stays in soft-recovery mode which is insufficient

### Possible approaches (to explore in brainstorm)

**A. Lower or remove the stale-assessment threshold**
Simple change to `assessStaleDiagnostics` but risks unnecessary server restarts for genuine missing modules.

**B. Re-sync affected open files after new file creation**
After `write` creates a new source file, identify open files that might import from it and explicitly re-sync them. Complex but precise.

**C. Add a `hardRecover` action that unconditionally restarts clients**
New `lsp recover --hard` action or `/supi-lsp-recover` command that bypasses stale assessment and directly restarts the TypeScript client. Simplest effective fix.

**D. Improve cascade detection to track `resultId` reset-based re-diagnosis**
After clearing pull result IDs, actively wait for re-diagnosis notifications for all open files, not just the synced file.

### Key constraints
- Don't break existing recovery flow for other cases (install, config changes)
- Avoid restarting the LSP client unnecessarily (can cause noticeable delay)
- Should handle the single-/dual-file stale-diagnostic case that the current threshold misses

### Ticket
TNDM-WASNR8