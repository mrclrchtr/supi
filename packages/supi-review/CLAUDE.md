# supi-review

Caller-defined code review tasks run in managed, Inspection-only Reviewer Sessions.

## Product contract

- A Review executes one exact Review Target plus complete caller-owned Review Tasks. Each task must select Review Mode: `change` or `state`.
- Tasks may list `criteriaSources` (`{ reference, summary }` issues or repository documents). The identified source stays authoritative; reviewers may retrieve it read-only when the summary is insufficient, and unavailable required detail yields structured incomplete Criteria Coverage.
- `/supi-review` may create one transient Planner Draft from bounded session context. It re-resolves the captured Review Snapshot before execution and stops when the selected target changed.
- The Review Engine owns target resolution, canonical packets and hashes, Review Workspace lifecycle, structured submissions, usage accounting, and per-task Task Verdicts.
- One to four independent tasks share a single frozen Review Workspace and run concurrently. Results remain separate; never aggregate or rerank their verdicts.
- `review.postReviewPolicy` controls the containing Agent's prompt-level response to findings on both review surfaces; direct user disposition wins while `/supi-review` with `report` remains terminal.

## Targets and Review Workspaces

- A Review Target has optional `from`, `to`, and `includeUncommittedChanges` fields. Omission selects the current filesystem. The Review Engine resolves endpoint syntax once to exact full commits. It does not compute a merge base in the public resolver.
- Included uncommitted changes default `from` to captured `HEAD` for a change task. Their workspace checks out exact `from` and stages one canonical patch to the frozen filesystem, including non-ignored untracked files. The caller index is not evidence.
- A committed change requires explicit `from`; `to` defaults to `HEAD`. Its workspace checks out exact `to`.
- A state task receives only the frozen after state. An all-state batch rejects explicit `from` and can review a root `to`. A change task needs a non-empty canonical change; a committed change rejects a root `to`; a root `from` is valid.
- Materialization re-compiles the linked workspace through the canonical patch compiler. Its receipt records exact endpoint state, uncommitted-change inclusion, expected and observed checkout, patch hashes, and changed-path count. After that, the caller checkout can change without changing Target Evidence.
- Workspaces are linked Git worktrees locked with the `supi-review:` ownership marker. Cleanup is best-effort; `/supi-review-cleanup` only lists that marker and never auto-prunes.

## Reviewer sessions

Reviewers receive Pi `read`, `bash`, and `grep`, headless Code Intelligence (`code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_find`, `code_health`), and `submit_review`. Do not restore the five target-specific inspection tools.

Inspection-only is a prompt protocol, not access control. The surrounding Sandboxed Pi Environment is the security boundary. When `review.bootstrapCommand` is configured, the Review Engine performs that one Dependency Bootstrap before fan-out and reviewers receive no bootstrap instruction; otherwise they may choose one. Reviewers must not intentionally mutate Target Evidence or Git history; tests, builds, linters, runtime experiments, nested Pi, and nested reviews are outside protocol.

Reviewer resource loading replaces Pi's generic coding prompt with the package-owned Reviewer Protocol and suppresses ambient extensions, context files, skills, prompt templates, themes, and discovered system prompts. The fixed Reviewer Extension Set is only the Code Intelligence Headless inspection profile, under the containing session's project-trust decision. Its registration failure leaves `read`/`bash`/`grep` available and produces a Reviewer Capability Warning separate from findings.

## Submission Recovery

After an accepted Reviewer Packet settles with usable history but no valid structured submission, Agent Run can perform one low-thinking same-session turn on the original model and one optional turn on `review.recoveryModel`. Recovery uses exactly `submit_review` and `decline_review_recovery`. It must not start after creation, readiness, preflight, cancellation, or timeout failure. Declined or exhausted recovery keeps the original failure and has no Task Verdict.

## Result grammar

`submit_review` returns a summary, ordered findings, and required structured Criteria Coverage. Parent-facing task output identifies Review Mode. Each finding has title, description, `blocksAcceptance`, impact, effort, confidence, and optional target-relative location. The Reviewer Protocol permits change findings attributable to the target and state findings relevant to the Review Criteria in the frozen after state. The Review Engine keeps `blocksAcceptance` unchanged and derives `issues` for any blocking finding, otherwise `incomplete` when Criteria Coverage is incomplete, otherwise `pass_with_findings` for advisory-only findings and `pass` for none, with structured finding counts by blocking status and impact.

Default child diagnostics retain only bounded lifecycle metadata and redacted provider error summaries. Each finished task also records a compact Review Debug Summary event (`supi-review` / `review-task`) with trustworthy lifecycle, usage, outcome, and explicit Reviewer Extension Set status only — no repository evidence, tool arguments, or inspected-resource claims. When `review.auditEnabled` is on, every task stores a private, seven-day local replay of provider-visible messages and tool output; omit thinking blocks/signatures and never include raw replay content in normal review output. Register `supi_review_audit` once and keep it active only while Agent tools and auditing are enabled.

## Main files

- `src/tool/review-workflow.ts` — Planner Draft and Review Workspace orchestration
- `src/workspace/review-workspace.ts` — linked-worktree materialization and best-effort cleanup
- `src/workspace/review-workspace-cleanup.ts` — marked-worktree recovery inventory/removal
- `src/workspace/cleanup-command.ts` — `/supi-review-cleanup`
- `src/tool/review-runner.ts` — Reviewer child, optional replay capture, and structured delivery
- `src/audit/` — private seven-day local replay persistence and trace capture
- `src/tool/child-session-runner.ts` — thin adapter over `@mrclrchtr/supi-agent-runtime`, mapping review resources and structured completion to `ChildRunOutcome`
- `src/target/` — target resolution, canonical patches, changed-path metadata, Reviewer Packets

## Testing seams

Use the agreed seams:

1. `runReview` with real temporary Git repositories and a fake Reviewer Session boundary
2. Review Workspace materialization/cleanup against real Git
3. Inline Planner Draft provenance, failure, and Review Snapshot drift behavior
4. Headless Code Intelligence registration and Workspace provider-host leases
5. `/supi-review-cleanup` command and picker behavior

Run package Vitest and source/test TypeScript builds while iterating, then `pnpm verify:ai`.
