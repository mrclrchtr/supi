# @mrclrchtr/supi-review

Runs caller-defined, read-only code review tasks in managed Pi child sessions.

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

This is a beta package with intentionally unstable interfaces.

## Surfaces

- `/supi-review` — interactive Direct or Planner-assisted review
- `supi_review_prepare` — optional preparation with `planning: "none" | "suggest"`
- `supi_review_run` — universal Direct or Prepared Review execution
- `supi_review_output` — retrieve continuation pages from review/preparation output

Preparation is optional. Skills and agents that already know how to review should use Direct Review.

## Direct Review

```json
{
  "mode": "direct",
  "target": {
    "kind": "comparison",
    "baseCommit": "9510d68"
  },
  "review": {
    "sharedContext": "The change implements issue #123.",
    "tasks": [
      {
        "id": "standards",
        "instructions": "Review against the repository standards."
      },
      {
        "id": "spec",
        "instructions": "Review against issue #123 and cite unmet requirements."
      }
    ]
  }
}
```

All tasks use one reviewer model and run concurrently. A run accepts one to four tasks. Direct and Prepared adapters use the same canonical packet compiler; every task result includes the SHA-256 of the exact packet bytes and nested-model usage when the provider reports it.

## Prepared Review

```json
{
  "target": { "kind": "working-tree" },
  "planning": "suggest"
}
```

Preparation returns a session-scoped `planId` and optional Planner Draft. Planner generation is advisory: provider, timeout, or structured-output failure returns a usable no-draft plan with bounded diagnostics. Continue with `use-review` in that case.

Execute a draft with an explicit decision:

```json
{
  "mode": "prepared",
  "planId": "review-plan-...",
  "decision": { "kind": "accept-draft" }
}
```

Use `use-review` with a complete replacement review when the draft needs editing. Invalid decisions do not consume the plan. Execution leases it against concurrent calls; any completed task consumes it, while an all-failed or all-canceled batch releases it for retry.

## Targets

The Review Engine resolves the Git worktree root once. Review paths and target identity are always relative to the entire worktree, even when Pi starts in a subdirectory.

- `working-tree` — net current filesystem plus non-ignored untracked files against `HEAD`, or against `merge-base(baseCommit, HEAD)` when optional `baseCommit` is supplied; computed through a temporary HEAD-seeded union index rather than the caller's real index
- `comparison` — merge base of `baseCommit` and captured `HEAD` to captured `HEAD`
- `commit` — first parent (or empty tree) to `commit`

To review a dirty feature branch including its committed and uncommitted work:

```json
{ "kind": "working-tree", "baseCommit": "9510d68" }
```

Agent-facing commit values accept 7–64 hexadecimal characters and are pinned to full commit object ids during resolution. The repository must remain stable from preparation or Direct invocation through reviewer completion, including retries; drift is not detected.

## Reviewer protocol

Callers own task methodology. The Review Engine owns target resolution, target-aware read-only tools, minimal finding-quality instructions, structured submission, child lifecycle, usage accounting, and per-task verdict derivation.

Reviewers receive only:

- `list_review_changes` — complete changed-path status and per-file `+/-` inventory
- `list_review_files` — after-side file inventory
- `read_review_diff` — the bounded paged full diff or one changed path's diff; oversized aggregate diffs require per-path reads
- `read_review_file` — before/after file content with optional `startLine`/`lineCount` selection
- `search_review_files` — before/after literal or extended-regex target search
- `submit_review`

They receive no shell, arbitrary extension tools, Pi context files, skills, or prompt templates. Discovered `SYSTEM.md` and `APPEND_SYSTEM.md` files are explicitly suppressed. In-memory child settings disable compaction and retries, so provider limits apply to the original packet.

Reviewer sessions have no package-owned wall-clock, turn, tool-use, or token cutoff. Agent-tool cancellation and the interactive Escape loader abort them explicitly; host cleanup stops waiting for an unresponsive provider abort after a short grace period.

Changed-file manifests include status and per-file numstat but remain bounded; `list_review_changes` provides the complete inventory. Input/result strings, finding counts, working-tree reads, and individual tool pages are also bounded. Working-tree patch hashing processes untracked files sequentially and does not retain the aggregate patch in the Review Plan.

## Results and continuation

Each successful task returns a summary and ordered findings. Findings contain:

- `blocksAcceptance`
- `impact`: `low | medium | high`
- `effort`: `small | medium | large`
- `confidence`: `0..1`
- optional target-relative location

The Review Engine derives `pass` or `issues` per task and never aggregates or reranks tasks. Batch details record `mode`, caller/planner provenance, packet hashes, and per-task usage. `supi_review_prepare` reports Planner usage; `supi_review_run` reports reviewer usage without charging Planner usage again.

Parent-facing text is stored as a bounded session artifact. When the first 12,000-character page is incomplete, the response includes an exact `supi_review_output` call containing `artifactId` and `offset`. Pages are repeatable until the bounded artifact expires or is evicted.

Non-success diagnostics retain allowlisted lifecycle metadata and optional provider-owned error summaries only. Error summaries are secret-redacted, control-character-stripped, and capped at 500 characters; reviewer conversation, repository evidence, tool arguments, and tool results are never retained as diagnostics.

## Models

`/supi-review` asks for the reviewer model. Agent-triggered runs use `review.agentModel`. Optional planning uses the separately configured `review.plannerModel` at low thinking effort. Both settings default to the current session model. If the configured Planner is unavailable, preparation still returns a no-draft plan.
