# Archive

## Verification Evidence

### Task 1 — Snapshot git helpers
- Added `getSnapshotFileDiff()` and `getSnapshotFileContent()` to `packages/supi-review/src/git.ts`
- Tests in `git.test.ts` (integration) and `git-timeout.test.ts` (timeout propagation) — **21 tests passed**

### Task 2 — Reviewer snapshot tools
- Created `packages/supi-review/src/tool/snapshot-tools.ts` with `read_snapshot_diff` and `read_snapshot_file` custom tools
- Updated `packages/supi-review/src/tool/review-runner.ts` to register tools and update system prompt
- Tests in `snapshot-tools.test.ts` and `runner.test.ts` — **16 tests passed**

### Task 3 — Compact review packet
- Refactored `packages/supi-review/src/target/packet.ts`: removed all inline diff packing; packet now returns `charBudget: 0`, `includedFiles: []`
- Updated `packages/supi-review/src/ui/flow.ts` preview to show on-demand access model
- Packet tests and command tests — **28 tests passed**

### Task 4 — Docs + regression sweep
- Updated `README.md` and `CLAUDE.md` for compact packet + snapshot tools architecture
- Full sweep: 95 tests, source TSC, tests TSC, Biome — **all clean**

### Post-review fixups (review findings #1-#3)
- **#1 Branch diff consistency**: changed `git diff <base> -- <file>` → `git diff <base> HEAD -- <file>` to freeze comparison to explicit refs
- **#2 Error propagation**: replaced blanket `catch { return undefined }` with per-kind error handling; `after` content errors propagate as exceptions
- **#3 Rename messaging**: `read_snapshot_file` "not available" message now includes hint about renames

### Final verification
- `pnpm vitest run packages/supi-review/` — 12/12 files, 95/95 tests PASS
- `pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json` — no errors
- `pnpm exec tsc --noEmit -p packages/supi-review/__tests__/tsconfig.json` — no errors
- `pnpm exec biome check packages/supi-review/` — no issues
