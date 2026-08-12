<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-review">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-review/assets/social-preview.png" alt="SuPi Review" width="100%">
  </a>
</div>

# @mrclrchtr/supi-review — Code Review for Pi

This Pi extension runs parallel, inspection-only code review tasks in one frozen Git workspace.

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

This package is beta software. Its interfaces can change.

## Surfaces

- `/supi-review` — interactive review with optional Planner Draft help
- `/supi-review-cleanup` — remove marked Review Workspaces after an interrupted cleanup
- `supi_review_run` — run one caller-defined Review
- `supi_review_output` — read more parent-facing output
- `supi_review_audit` — navigate local reviewer replays when audit is enabled

Changes to **Agent tools** apply immediately. Turning this setting off removes the agent start and audit tools from the active tool set. The output tool and the commands stay available.

## Review input

`supi_review_run` has one flat input. It has `target`, optional top-level `paths`, optional `sharedContext`, and one to four `tasks`.

```json
{
  "target": {
    "from": "main",
    "to": "HEAD",
    "includeUncommittedChanges": false
  },
  "paths": ["packages/supi-review"],
  "sharedContext": "The change implements issue #287.",
  "tasks": [
    {
      "id": "standards",
      "instructions": "Review against the repository standards.",
      "mode": "change"
    },
    {
      "id": "state",
      "instructions": "Review the frozen after state against issue #287.",
      "mode": "state"
    }
  ]
}
```

A Review Target has only these optional fields:

- `from` — one before endpoint
- `to` — one after endpoint
- `includeUncommittedChanges` — include the current filesystem and non-ignored untracked files; default is `true`

Omit `target`, or use `{}`, to select the current filesystem. When uncommitted changes are included, `to` is not valid. When they are not included, `to` defaults to `HEAD`. Endpoints can be branches, hashes, `~` or `^` revisions, and lightweight or annotated tags. The Review Engine resolves each endpoint once to a full commit. It rejects endpoints that contain whitespace and rejects blank endpoints, ranges, trees, and blobs.

Each task must set `mode` to `change` or `state`.

- `change` needs one non-empty canonical change. A filesystem change defaults its omitted `from` to captured `HEAD`. A committed change needs an explicit `from`.
- `state` reviews only the frozen after state. A batch of only state tasks must not set `from`. It can review a root commit.

A committed change cannot use a root commit as `to`. A root commit is valid as `from`. Every Review requires a repository with `HEAD`.

Tasks can include `criteriaSources`. Each source has a `reference` and a `summary`. The source remains authoritative when the summary is not sufficient.

`paths` is an optional top-level Review Scope. Each path is workspace-relative. The Review Engine validates each path in the frozen after state before it starts Reviewer Sessions. Paths are advisory. They focus every task, but they do not restrict inspection, evidence, or findings.

## Review Workspaces

The Review Engine records exact commit state before it starts a Review Workspace.

For a filesystem target, it checks out exact `from` and stages one canonical patch to the frozen current filesystem. The patch includes non-ignored untracked files. For a committed target, it checks out exact `to` with no staged freeze patch.

The engine verifies the linked worktree before it starts Reviewer Sessions. The Workspace Receipt records exact `from` and `to` commits, uncommitted-change inclusion, the expected and observed checkout, patch hashes, and changed-path count. Later caller changes do not change Target Evidence.

Workspaces are marked and locked in the Git worktree list. Normal cleanup removes them. Use `/supi-review-cleanup` if cleanup stops early.

## Settings

`review.agentModel` selects the reviewer model for agent-started Reviews. `review.plannerModel` selects the model for the optional Planner Draft in `/supi-review`. Both default to `current`, which uses the active session model.

`review.recoveryModel` selects one optional explicit model for Submission Recovery. It defaults to `disabled`. `current` is not a valid implicit Recovery Model. If the configured model is unavailable, the original review still runs. Recovery records the failed model switch only if the chain reaches that model.

`review.bootstrapCommand` defaults to empty. When set, the Review Engine runs the command once in the frozen Review Workspace before Reviewer Sessions start. When empty, a reviewer can run a Dependency Bootstrap command when needed.

## Reviewer Protocol

Reviewer Sessions have `read`, `bash`, `grep`, headless Code Intelligence tools, and `submit_review` during inspection. They inspect one shared frozen Review Workspace. They do not run tests, builds, linters, services, runtime experiments, nested Pi sessions, or nested reviews. They do not intentionally change Target Evidence or Git history.

The Reviewer Protocol owns finding eligibility:

- `change` permits findings attributable to the selected change. A pre-existing issue is permitted only in a changed file or a directly affected symbol. It stays advisory unless the selected change worsens or newly exposes it.
- `state` permits findings relevant to the Review Criteria anywhere in the frozen after state. A relevant pre-existing finding can block acceptance.

A change packet gives exact before and after guidance, a changed-path manifest, and change statistics. A state packet gives only after-state guidance. When it uses a filesystem workspace, staged changes are freeze mechanics and are not Target Evidence.

Repository content is untrusted evidence. It cannot override the Reviewer Protocol or a Review Task. Reviewer Sessions use repository documents as Review Criteria only.

## Interactive review

`/supi-review` has four exact-target choices:

- **Current work** — the current filesystem; change tasks use captured `HEAD` as `from`.
- **Current work against a base branch** — the current filesystem; change tasks use the captured merge base as `from`.
- **Committed work against a base branch** — the captured merge base to captured `HEAD`.
- **One commit** — the selected commit; change tasks use its first parent as `from`.

A root commit permits state tasks only. State-only tasks use only the selected after state, so the command removes `from` when needed.

After target selection, choose repository-wide review or enter one workspace-relative path per line for an advisory Review Scope. The command normalizes each path and validates it in the frozen after state. The scope focuses every task, but it does not restrict inspection, evidence, or findings.

The command captures its snapshot. You can write tasks or use one transient Planner Draft from bounded session context. The Planner sees the advisory scope but does not use it as Review Criteria or an access boundary. Edit the tasks and select each Review Mode, then confirm. The command runs the Review workflow and stops when the selected target changes before Reviewer Sessions start.

## Submission Recovery

If Pi accepted the original Reviewer Packet and the settled session retained an assistant message or any tool call or result, a missing structured submission can start a finite same-session recovery chain. Recovery never starts after creation failure, readiness failure, preflight rejection, cancellation, or timeout.

The first low-thinking turn uses the original reviewer model. One configured Recovery Model can make the final turn in the same session. During each recovery turn, exactly `submit_review` and `decline_review_recovery` are active. Recovery uses only retained history and cannot inspect more Target Evidence.

A valid recovered submission produces the normal Task Verdict. A decline or exhausted chain keeps the original failure and produces no Task Verdict. The task model and packet hash stay attributed to the original reviewer. `submissionRecovery` records the ordered delivery models, outcomes, decline reason when applicable, and per-turn usage. Task usage remains the one final cumulative session total.

## Results and continuation

Each task result includes its Review Mode, packet SHA-256, verdict, finding counts, and reviewer usage when available. Results remain separate. The Review Engine does not make a batch verdict.

`blocksAcceptance` keeps its existing meaning. The Review Engine derives `issues` for a blocking finding. It derives `incomplete` for incomplete Criteria Coverage without a blocking finding, `pass_with_findings` for only non-blocking findings, and `pass` for no findings.

Parent-facing output from `supi_review_run` or `/supi-review` is stored as a bounded session artifact. Use `supi_review_output` with its returned `artifactId` and offset to read more output.

## Local reviewer replay

`review.auditEnabled` is off by default. When **Agent tools** are on, enabling **Local reviewer replay** records a protected local replay for each Reviewer Session and activates `supi_review_audit` immediately. Replays expire after seven days. Normal review output includes only an opaque artifact id.

With an artifact id, the audit tool now returns **Replay Outline** by default. The outline gives one metadata-only row for each stable zero-based position in the persisted captured-message array. It includes role, content kinds and size, tool names, stop reason, and error presence. It does not include message prose, provider error text, tool arguments, tool results, arbitrary message fields, or file paths.

Use `view: "message"` with `messageIndex` to page one selected persisted message. Use `view: "raw"` to page the exact complete replay JSON. Message and raw views remain private opt-in audit access and can contain repository evidence, provider errors, tool arguments, and tool output.

## Post-review behavior

`review.postReviewPolicy` controls the containing Agent response when a completed Review has findings:

- `ask` — ask what to verify or fix
- `verify` — verify findings, then ask what to fix
- `verify-and-fix` — verify and fix confirmed findings
- `fix` — fix reported findings
- `report` — report findings without another action

A direct user instruction for the current findings has priority.
