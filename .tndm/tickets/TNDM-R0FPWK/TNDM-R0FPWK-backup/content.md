## Overview
Shrink `packages/supi-review` reviewer prompts by removing bulk inline diff sections from the initial `ReviewPacket` and replacing them with on-demand snapshot inspection tools inside the read-only reviewer session.

## Goals
- Keep the initial reviewer packet compact and stable even for large snapshots.
- Preserve patch-aware review quality by letting the reviewer fetch exact per-file diffs and before/after file contents when needed.
- Keep the reviewer tool surface read-only and narrowly scoped to the selected review snapshot.

## Approach
1. Keep the session-derived brief, target metadata, changed-file manifest, and compact per-file overview in the review packet.
2. Remove the current prompt-budget-driven inline diff packing from `buildReviewPacket()`.
3. Add snapshot access helpers that can resolve, for the selected snapshot kind, a changed file's diff plus its before/after contents.
4. Register reviewer-only custom tools for those helpers and update the reviewer system prompt so the child agent uses them instead of relying on preloaded inline diffs.
5. Update tests and package docs to reflect the new compact-packet + on-demand-inspection flow.

## File map
- `packages/supi-review/src/target/packet.ts` — compact review packet builder; keep metadata/file overview, remove bulk inline diff inclusion.
- `packages/supi-review/src/git.ts` — snapshot-specific helpers for per-file diff and before/after file reads across working-tree, branch, and commit targets.
- `packages/supi-review/src/tool/snapshot-tools.ts` — reviewer-only custom tool definitions that expose snapshot diff/file access safely.
- `packages/supi-review/src/tool/review-runner.ts` — register the new snapshot tools and update reviewer instructions/tool activity text.
- `packages/supi-review/src/types.ts` — extend shared review types only if the snapshot tools need explicit typed payloads.
- `packages/supi-review/README.md` and `packages/supi-review/CLAUDE.md` — document the compact packet behavior and on-demand snapshot inspection model.
- `packages/supi-review/__tests__/unit/packet.test.ts` — verify compact packet contents and removal of inline diff packing behavior.
- `packages/supi-review/__tests__/unit/git.test.ts` / `git-timeout.test.ts` — verify snapshot helper behavior and timeout propagation.
- `packages/supi-review/__tests__/unit/runner.test.ts` — verify reviewer session tool registration and prompt guidance.
- `packages/supi-review/__tests__/unit/review-command.test.ts` — keep command wiring expectations aligned with the new packet shape.
- `packages/supi-review/__tests__/unit/snapshot-tools.test.ts` — cover custom snapshot tool behavior directly.

## Constraints
- Reviewer access must stay read-only.
- The tools must only expose files that belong to the selected snapshot / changed-file set.
- Working-tree snapshots should treat `before` as the baseline from git and `after` as the current working copy.
- Branch and commit snapshots should resolve `before` / `after` from the actual compared revisions, not from the live working tree.

## Verification strategy
Use TDD for packet, git-helper, and runner/tool changes. Finish with targeted package verification:
- `pnpm vitest run packages/supi-review/`
- `pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json`
- `pnpm exec tsc --noEmit -p packages/supi-review/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-review/`
