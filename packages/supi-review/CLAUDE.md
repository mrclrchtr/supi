# supi-review

Caller-defined code review tasks executed in managed, read-only child sessions.

## Product contract

- Direct Review executes a target plus complete review input in one call.
- Prepared Review creates a bounded session-scoped Review Plan first.
- Valid execution leases the plan; any completed task consumes it, while an all-non-completed batch releases it for retry.
- Preparation is optional and may request a lightweight Planner Draft; Planner failure returns a usable no-draft plan.
- Callers own task methodology through `{ id, instructions }` tasks.
- The Review Engine owns target resolution, canonical packet construction and hashing, read-only tools, child lifecycle, result grammar, and per-task verdicts.
- One to four tasks run concurrently using one reviewer model.
- Results remain separate per task; there is no run-level verdict or host reranking.

## Targets

- Working tree: net baseline to current files plus non-ignored untracked files; baseline is `HEAD` by default or the merge base of an optional caller-supplied base commit and captured `HEAD`. Use a temporary HEAD-seeded index augmented with baseline-only tracked entries so the caller's real index and index flags are not semantic inputs and branch deletions/renames compare directly with the current filesystem.
- All targets resolve against the canonical Git worktree root, regardless of Pi's launch subdirectory.
- Comparison: merge base of a caller-supplied 7–64 character hexadecimal base commit and captured `HEAD` to captured `HEAD`.
- Commit: first parent or empty tree to the supplied 7–64 character hexadecimal commit.
- Short commit ids are resolved and pinned to full object ids before packet construction.
- Repository stability through review completion is a caller precondition. The package intentionally performs no fingerprint or freshness check.

## Planner

- Uses the separately configured Planner model at low thinking effort.
- Receives bounded compaction/branch summaries, recent visible conversation, a bounded changed-path status/numstat inventory, and target stats.
- Receives no code, diffs, prior tool calls/results, context files, or inspection tools; only `submit_review_plan` is registered.
- Produces only advisory `{ sharedContext?, tasks }` input.
- Draft tasks must be answerable through the reviewer's fixed static inspection tools; they cannot request shell/runtime/nested-review operations.
- Prepared execution explicitly accepts or replaces a draft.
- Draft and effective input remain separate in planning provenance.

## Reviewer sessions

Tools are fixed and target-aware:

- `list_review_changes` — complete status and per-file numstat inventory
- `list_review_files` — after-side file inventory
- `read_review_diff` — full target diff or one changed path, character-paged
- `read_review_file` — before/after content with optional line-range selection, character-paged
- `search_review_files` — before/after literal or extended-regex search
- `submit_review`

Do not reintroduce live-checkout built-in read/search tools for commit-based targets. Reviewer resource loading disables extensions, context files, skills, prompt templates, and themes, explicitly suppresses discovered `SYSTEM.md` / `APPEND_SYSTEM.md` files, and uses in-memory settings with compaction/retries disabled. Inspection outputs are paged; canonical packet bytes are not. Parent-facing preparation/run text uses bounded session artifacts retrievable through `supi_review_output`.

## Result grammar

The reviewer submits a task summary plus findings. Each finding has title, description, `blocksAcceptance`, impact, effort, confidence, and optional target-relative location. The Review Engine derives `pass` when no finding blocks acceptance and `issues` otherwise. It validates confidence only as `0..1`, preserves reviewer order, and applies no category or confidence policy. Every task outcome carries the SHA-256 of its exact canonical packet bytes and nested-model usage when reported. Reviewer sessions have no package-owned automatic runtime/turn/tool/token cutoff; explicit cancellation has a bounded abort grace.

## Main files

- `src/review.ts` — command and extension wiring
- `src/git.ts` — target-aware repository reads, diffs, listings, and searches
- `src/target/resolve.ts` — root-pinned target resolution and patch identity
- `src/target/change-metadata.ts` — Git status/numstat reconciliation and patch accounting
- `src/target/diff.ts` — shared deterministic patch flags, untracked diffs, and NUL-list parsing
- `src/git-choices.ts` — interactive branch/commit choices
- `src/review-path.ts` — repository-relative path, size, and symlink containment boundary
- `src/target/packet.ts` — canonical reviewer packet
- `src/tool/review-workflow.ts` — Direct/Prepared orchestration
- `src/tool/agent-review-tools.ts` — prepare/run agent tools
- `src/tool/review-output-tool.ts` — resumable parent-output tool
- `src/tool/planner-runner.ts` — optional lightweight Planner
- `src/tool/child-resource-loader.ts` — inherited-resource suppression for child sessions
- `src/tool/review-runner.ts` — managed reviewer child
- `src/tool/review-tools.ts` — target-aware tool definitions
- `src/review-result.ts` — per-task verdict derivation

## Testing seams

Test behavior through:

1. Direct/Prepared Review workflow
2. Git target resolution and target-aware reads/searches
3. packet compilation and result normalization
4. output artifact retrieval
5. extension command/tool registration

Use package-scoped Vitest plus both source and test TypeScript builds.
