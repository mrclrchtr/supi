# Task 1: Investigate and verify all possible solutions for stale LSP diagnostic recovery

## Goal

Investigate each of the 8 desired improvements from the design brief, determine feasibility and trade-offs, and verify findings with tests.

## Investigation areas

### 1. Lower stale-assessment threshold (`assessStaleDiagnostics`)
- Change `matchedFiles.length >= 3` to `>= 1`
- Update or add test cases for 1-file and 2-file scenarios
- Evaluate risk: does this cause unnecessary restarts for genuine missing modules?

### 2. Re-sync affected open files after new file creation
- In `syncClientFileAndGetCascadingDiagnostics`, after `didOpen` for a new file, identify open files that import from the new file path
- Issue `didChange` or re-sync for those files to force re-diagnosis
- Measure: does tsserver actually respond with updated diagnostics?

### 3. Hard recovery action (`lsp recover --hard`)
- Add a `hardRecover` variant that calls `restartClientsForFiles` unconditionally
- Wire it into `lsp_recover` tool action or add a new `/supi-lsp-recover` command
- Test: does restarting the client actually clear the stale diagnostic?

### 4. Improve cascade detection with resultId tracking
- After `clearAllPullResultIds()`, wait for re-diagnosis of all open files, not just the synced file
- Check if pull-model servers send `publishDiagnostics` for all open files after resultId reset

### 5. Immediate second-pass recovery after write/edit
- In the post-write/edit recovery path, run a second recovery pass before returning inline diagnostics
- Ensure no double-recovery or performance regression

### 6. Recovery ladder
- In `recoverWorkspaceDiagnostics`, implement escalation: soft recovery → reopen stale files → restartIfStillStale
- Only escalate when stale fingerprint persists after each step

### 7. Broader change triggers
- Expand the set of file events that trigger recovery beyond sentinel files to include all source-file create/delete
- Risk: too-frequent recovery calls

### 8. Improved user-facing messaging
- Modify diagnostic display to annotate suspected stale diagnostics vs real errors
- Add a "diagnostics may be stale" suffix or icon for suspected stale entries

## Verification

- All existing stale-diagnostics, cascade, overrides, recover, and suppression tests must pass
- Add new test cases for threshold changes and recovery ladder behavior
- Manual testing: create new file, import from it in existing file, verify diagnostic clears
