# Archive

## Verification Evidence

### Task 1 — Replace heuristic collection with compaction-style serializer
- **Files changed**: `collect.ts`, `types.ts`, `history-collect.test.ts`
- **Verification**: `pnpm vitest run packages/supi-review/__tests__/unit/history-collect.test.ts -v` — **9 tests passed**
- **Result**: Removed `collectHistoryEvidence()` (heuristic scoring, path-token matching, intent-word regex). Replaced with `serializeSessionContext()` which produces a deterministic compaction-style labeled transcript from resolved session-context messages. Removed `HistoryEvidence` type and `evidenceCount` from `SynthesizedReviewBrief`.

### Task 2 — Rework brief synthesis and command wiring
- **Files changed**: `synthesize.ts`, `review.ts`, `brief-runner.ts`, `runner-types.ts`, plus 7 test fixture files
- **Verification**: `pnpm vitest run packages/supi-review/__tests__/unit/history-synthesize.test.ts packages/supi-review/__tests__/unit/review-command.test.ts packages/supi-review/__tests__/unit/brief-runner.test.ts packages/supi-review/__tests__/unit/packet.test.ts packages/supi-review/__tests__/unit/runner.test.ts packages/supi-review/__tests__/unit/renderer.test.ts packages/supi-review/__tests__/unit/index.test.ts -v` — **52 tests passed**
- **Result**: `synthesize.ts` now accepts `serializedContext: string` instead of `evidence: HistoryEvidence[]`. Prompt shows `## Serialized session context` instead of `## Session evidence`. `review.ts` wires `serializeSessionContext()` from `buildSessionContext()`. Removed dead `BriefSynthesisInput` interface.

### Task 3 — Docs and full verification
- **Files changed**: `README.md`, `CLAUDE.md`
- **Verification**: Full package sweep:
  - `pnpm vitest run packages/supi-review/ -v` — **77 tests passed**
  - `pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json` — clean
  - `pnpm exec tsc --noEmit -p packages/supi-review/__tests__/tsconfig.json` — clean
  - `pnpm exec biome check packages/supi-review` — clean
- **Result**: Updated README and CLAUDE.md to describe compaction-style serialization instead of evidence scoring.

### Summary
15 files changed, 293 insertions, 257 deletions. All 77 tests, both typechecks, and Biome pass with fresh runs.
