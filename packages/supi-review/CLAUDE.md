# supi-review

Caller-defined code review tasks executed in managed, read-only child sessions.

## Product contract

- Direct Review executes a target plus complete review input in one call.
- Prepared Review creates a session-scoped, one-shot Review Plan first.
- Preparation is optional and may request a lightweight Planner Draft.
- Callers own task methodology through `{ id, instructions }` tasks.
- The Review Engine owns target resolution, canonical packet construction and hashing, read-only tools, child lifecycle, result grammar, and per-task verdicts.
- One to four tasks run concurrently using one reviewer model.
- Results remain separate per task; there is no run-level verdict or host reranking.

## Targets

- Working tree: net `HEAD` to current files plus non-ignored untracked files; use a temporary HEAD-seeded index so the caller's real index and index flags are not semantic inputs.
- Comparison: merge base of caller-supplied full base commit and captured `HEAD` to captured `HEAD`.
- Commit: first parent or empty tree to the supplied full commit.
- Agent tools accept full commit object ids only.
- Repository stability through review completion is a caller precondition. The package intentionally performs no fingerprint or freshness check.

## Planner

- Uses the separately configured Planner model at low thinking effort.
- Receives bounded compaction/branch summaries, recent visible conversation, changed-file names, and target stats.
- Receives no code, diffs, tool calls/results, context files, or tools.
- Produces only advisory `{ sharedContext?, tasks }` input.
- Prepared execution explicitly accepts or replaces a draft.
- Draft and effective input remain separate in planning provenance.

## Reviewer sessions

Tools are fixed and target-aware:

- `list_review_files`
- `read_review_diff`
- `read_review_file`
- `search_review_files`
- `submit_review`

Do not reintroduce live-checkout built-in read/search tools for commit-based targets. Reviewer resource loading disables extensions, context files, skills, prompt templates, and themes, explicitly suppresses discovered `SYSTEM.md` / `APPEND_SYSTEM.md` files, and uses in-memory settings with compaction/retries disabled. Inspection outputs are paged; canonical packet bytes are not.

## Result grammar

The reviewer submits a task summary plus findings. Each finding has title, description, `blocksAcceptance`, impact, effort, confidence, and optional target-relative location. The Review Engine derives `pass` when no finding blocks acceptance and `issues` otherwise. It validates confidence only as `0..1`, preserves reviewer order, and applies no category or confidence policy. Every task outcome carries the SHA-256 of its exact canonical packet bytes.

## Main files

- `src/review.ts` — command and extension wiring
- `src/git.ts` — target resolution and target-aware repository access
- `src/review-path.ts` — repository-relative path and symlink containment boundary
- `src/target/packet.ts` — canonical reviewer packet
- `src/tool/review-workflow.ts` — Direct/Prepared orchestration
- `src/tool/agent-review-tools.ts` — public agent tools
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
4. extension command/tool registration

Use package-scoped Vitest plus both source and test TypeScript builds.
