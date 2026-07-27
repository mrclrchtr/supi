# @mrclrchtr/supi-review

Runs caller-defined, read-only code review tasks in managed Pi child sessions.

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

This is a beta package with intentionally unstable interfaces.

## Surfaces

- `/supi-review` — interactive Direct or Planner-assisted review
- `supi_review_prepare` — optional one-shot preparation with `planning: "none" | "suggest"`
- `supi_review_run` — universal Direct or Prepared Review execution

Preparation is optional. Skills and agents that already know how to review should use Direct Review.

## Direct Review

```json
{
  "mode": "direct",
  "target": {
    "kind": "comparison",
    "baseCommit": "<full commit object id>"
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

All tasks use one reviewer model and run concurrently. A run accepts one to four tasks. Direct and Prepared adapters use the same canonical packet compiler; every task result includes the SHA-256 of the exact packet bytes.

## Prepared Review

```json
{
  "target": { "kind": "working-tree" },
  "planning": "suggest"
}
```

Preparation returns a session-scoped, one-shot `planId` and optional Planner Draft. Execute it with an explicit decision:

```json
{
  "mode": "prepared",
  "planId": "review-plan-...",
  "decision": { "kind": "accept-draft" }
}
```

Use `use-review` with a complete replacement review when the draft needs editing.

## Targets

- `working-tree` — net `HEAD` to current filesystem, plus non-ignored untracked files, computed through a temporary HEAD-seeded index rather than the caller's real index
- `comparison` — merge base of a full `baseCommit` and captured `HEAD` to captured `HEAD`
- `commit` — first parent (or empty tree) to a full commit object id

Agent-facing commit values must be full hexadecimal object ids. The repository must remain stable from preparation or Direct invocation until reviewers finish; drift is not detected.

## Reviewer protocol

Callers own task methodology. The Review Engine owns:

- target resolution
- target-aware read-only tools
- minimal finding-quality instructions
- structured submission
- child lifecycle handling
- per-task verdict derivation

Reviewers receive no shell, arbitrary extension tools, Pi context files, skills, or prompt templates. Discovered `SYSTEM.md` and `APPEND_SYSTEM.md` files are explicitly suppressed; only the package-owned reviewer protocol is appended to Pi's base system prompt. In-memory child settings disable compaction and retries so provider limits apply to the original packet. Inspection-tool and parent-visible outputs are paged/bounded; canonical packet bytes are never truncated.

## Result

Each successful task returns a summary and ordered findings. Findings contain:

- `blocksAcceptance`
- `impact`: `low | medium | high`
- `effort`: `small | medium | large`
- `confidence`: `0..1`
- optional target-relative location

The Review Engine derives `pass` or `issues` per task and never aggregates or reranks tasks. Batch details also record `mode`, caller/planner provenance, and each task's packet hash.

## Models

`/supi-review` asks for the reviewer model. Agent-triggered runs use `review.agentModel`. Optional planning uses the separately configured `review.plannerModel` at low thinking effort. Both settings default to the current session model for availability; configure `review.plannerModel` to a lightweight model when using Planner suggestions.
