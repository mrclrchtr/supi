# @mrclrchtr/supi-review

Runs caller-defined, Inspection-only code review tasks in managed Pi child sessions.

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

This is a beta package with intentionally unstable interfaces.

## Surfaces

- `/supi-review` — interactive Direct or Planner-assisted review
- `/supi-review-cleanup` — recover marked Review Workspaces left by interrupted cleanup
- `supi_review_prepare` — optional preparation with `planning: "none" | "suggest"`
- `supi_review_run` — universal Direct or Prepared Review execution
- `supi_review_output` — retrieve continuation pages from review/preparation output
- `supi_review_audit` — disabled-by-default retrieval of locally recorded reviewer replays

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
        "instructions": "Review against the repository standards.",
        "findingScope": "change-only"
      },
      {
        "id": "spec",
        "instructions": "Review against issue #123 and cite unmet requirements."
      }
    ]
  }
}
```

One to four tasks share a reviewer model and one frozen Review Workspace. Direct and Prepared adapters use the same canonical packet compiler; every task result includes the SHA-256 of the exact packet bytes and nested-model usage when reported.

## Prepared Review

Preparation returns a session-scoped `planId` and optional Planner Draft. Planner failure returns a usable no-draft plan. Before a Prepared Review runs, the engine re-resolves the target and compares its exact Review Snapshot; drift invalidates the plan. A batch with at least one completed task consumes its plan, while an all-non-completed batch releases it for retry.

```json
{
  "mode": "prepared",
  "planId": "review-plan-...",
  "decision": { "kind": "accept-draft" }
}
```

Use `use-review` with a complete replacement review when the draft needs editing.

## Targets and Review Workspaces

The Review Engine resolves the Git worktree root once and pins commit identities before materializing one disposable linked Git worktree for the batch:

- `working-tree` — net current filesystem plus non-ignored untracked files against `HEAD`, or `merge-base(baseCommit, HEAD)`; the caller index is not evidence
- `comparison` — merge base of `baseCommit` and captured `HEAD` to captured `HEAD`
- `commit` — first parent (or empty tree) to `commit`

A Working-Tree Review Workspace checks out its pinned baseline and stages the exact canonical patch, so `git diff HEAD` shows the complete target. Comparison and Commit workspaces check out their pinned after commit. Before Reviewer Sessions start, the engine re-compiles the target patch from the linked workspace and verifies its hash, expected checkout commit, and changed-path count. Every completed batch includes that compact Workspace receipt, so later caller edits cannot change the in-flight target.

Workspaces are marked and locked in Git's worktree inventory. Normal cleanup removes them; an interrupted or failed cleanup can be recovered with `/supi-review-cleanup`. That command lists only SuPi-marked worktrees, requires a second confirmation for apparently active owners, and continues after individual failures.

## Reviewer protocol

Reviewers receive:

- Pi built-in `read`, `bash`, and `grep`
- `code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_find`, and `code_health`
- `submit_review`

They use ordinary Git and direct reads in the frozen Review Workspace. Before-side content remains available through the packet's pinned Git revision. Code Intelligence runs in a headless inspection profile; an unavailable profile produces a Reviewer Capability Warning, while the built-in inspection tools remain available.

Each Review Task may set `findingScope` to `change-only` (the default) or `boy-scout`. Change-only findings must be attributable to the selected change, including omitted or partial required behavior and acceptance-relevant scope creep. Boy Scout scope may additionally report pre-existing issues in changed files or symbols the reviewer judges directly affected; purely pre-existing findings are advisory unless the change worsens or newly exposes them. Repository standards and specifications requested by a task are Review Criteria, but repository content can never override the fixed Reviewer Protocol or task.

Inspection-only is behavioral protocol, not access control. The surrounding Sandboxed Pi Environment is the security boundary and must contain only files and credentials acceptable for reviewer-model access. When `review.bootstrapCommand` is configured, the Review Engine runs its shell command once after workspace verification and before reviewer fan-out; reviewers then receive no Dependency Bootstrap instruction. When it is empty, reviewers may choose a Dependency Bootstrap command when local dependencies limit Code Intelligence. They must not intentionally mutate Target Evidence or Git history, and must not run tests, builds, linters, runtime experiments, services, nested Pi sessions, or nested reviews.

Reviewer Sessions replace Pi's generic coding prompt with the package-owned Reviewer Protocol. Ambient extensions, context files, skills, prompt templates, themes, and discovered system prompts are suppressed. In-memory settings disable compaction and provider retries.

## Results and continuation

Each successful task returns a summary, ordered findings, and structured counts by blocking status and impact. Parent-facing task output identifies the effective Finding Scope. Findings contain `blocksAcceptance`, `impact`, `effort`, `confidence`, and an optional target-relative location. The Review Engine derives `pass` when there are no findings, `pass_with_findings` for advisory-only findings, and `issues` when any finding blocks acceptance; it never aggregates or reranks tasks.

Capability and cleanup warnings are execution provenance, not findings. By default, non-success diagnostics retain only bounded lifecycle metadata and redacted provider-owned error summaries; reviewer conversation, shell commands, tool arguments/results, and repository evidence are never retained.

### Local reviewer replay

`review.auditEnabled` is off by default and requires `/reload` after changing it. When enabled, every task records a protected local replay containing provider-visible messages, tool calls/results, packet and protocol text, lifecycle timing, usage, and the Workspace receipt. Thinking blocks and thought signatures are omitted.

Replays expire automatically after seven days. They are not included in normal review output: a task reports only an opaque artifact id. Use `supi_review_audit` to list artifacts or page through one by id. Replays can contain raw repository evidence and shell output, so enable this only in environments where seven-day local retention is acceptable.

Parent-facing text is stored as a bounded session artifact. Use `supi_review_output` with its returned opaque `artifactId` and offset to retrieve continuation pages.

## Models

`/supi-review` asks for the reviewer model. Agent-triggered runs use `review.agentModel`. Optional planning uses `review.plannerModel` at low thinking effort. Both default to the current session model.

Configure a single dependency setup command:

```json
{
  "review": {
    "bootstrapCommand": "pnpm install --frozen-lockfile"
  }
}
```

In `/supi-settings`, enter `pnpm install --frozen-lockfile`. An empty command (the default) leaves dependency bootstrap available to reviewers.
