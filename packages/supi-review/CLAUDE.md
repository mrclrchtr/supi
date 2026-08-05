# supi-review

Caller-defined code review tasks run in managed, Inspection-only Reviewer Sessions.

## Product contract

- Direct Review executes one target plus complete caller-owned Review Tasks. Git change tasks may select `change-only` (default) or `boy-scout` Finding Scope; Current-State Audit fixes `criteria-only` and rejects caller-selected scope.
- Tasks may list `criteriaSources` (`{ reference, summary }` issues or repository documents). The identified source stays authoritative; reviewers may retrieve it read-only when the summary is insufficient, and unavailable required detail yields structured incomplete Criteria Coverage.
- Prepared Review creates a one-shot Review Plan. Execution re-resolves its Review Snapshot; drift invalidates the plan before a Reviewer Session starts. Any completed task consumes a plan; an all-non-completed batch releases it.
- The Review Engine owns target resolution, canonical packets and hashes, Review Workspace lifecycle, structured submissions, usage accounting, and per-task Task Verdicts.
- One to four independent tasks share a single frozen Review Workspace and run concurrently. Results remain separate; never aggregate or rerank their verdicts.
- `review.postReviewPolicy` controls the containing Agent's prompt-level response to findings on both review surfaces; direct user disposition wins while `/supi-review` with `report` remains terminal.

## Targets and Review Workspaces

- Working tree targets compare the net current filesystem (including non-ignored untracked files) to `HEAD`, or `merge-base(baseCommit, HEAD)`. The caller index is not evidence.
- Current-State Audit freezes the complete current filesystem (including uncommitted and untracked work) against `HEAD` as one reviewed state without Git attribution. It accepts optional validated advisory Review Scope paths, allows zero changes, and reviewers receive no before-side instructions or changed-path manifest.
- Comparison and commit targets pin full commit identities. A working-tree workspace checks out the baseline and stages the exact canonical patch; commit/comparison workspaces check out their pinned after commit.
- Materialization verifies the current Working-Tree Review patch hash before children start, then re-compiles the linked workspace through the canonical patch compiler. Its receipt records mode, baseline, expected/observed checkout, diff hashes, and changed-path count. After that, the caller checkout may change without changing Target Evidence.
- Workspaces are linked Git worktrees locked with the `supi-review:` ownership marker. Cleanup is best-effort; `/supi-review-cleanup` only lists that marker and never auto-prunes.

## Reviewer sessions

Reviewers receive Pi `read`, `bash`, and `grep`, headless Code Intelligence (`code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_find`, `code_health`), and `submit_review`. Do not restore the five target-specific inspection tools.

Inspection-only is a prompt protocol, not access control. The surrounding Sandboxed Pi Environment is the security boundary. When `review.bootstrapCommand` is configured, the Review Engine performs that one Dependency Bootstrap before fan-out and reviewers receive no bootstrap instruction; otherwise they may choose one. Reviewers must not intentionally mutate Target Evidence or Git history; tests, builds, linters, runtime experiments, nested Pi, and nested reviews are outside protocol.

Reviewer resource loading replaces Pi's generic coding prompt with the package-owned Reviewer Protocol and suppresses ambient extensions, context files, skills, prompt templates, themes, and discovered system prompts. The fixed Reviewer Extension Set is only the Code Intelligence Headless inspection profile, under the containing session's project-trust decision. Its registration failure leaves `read`/`bash`/`grep` available and produces a Reviewer Capability Warning separate from findings.

## Result grammar

`submit_review` returns a summary, ordered findings, and required structured Criteria Coverage. Parent-facing task output identifies the effective Finding Scope. Each finding has title, description, `blocksAcceptance`, impact, effort, confidence, and optional target-relative location. `change-only` admits issues attributable to the target; `boy-scout` also admits pre-existing issues in changed files or reviewer-judged directly affected symbols, but purely pre-existing findings remain advisory; `criteria-only` admits any criterion-relevant finding regardless of when introduced. The Review Engine derives `issues` for any blocking finding, otherwise `incomplete` when Criteria Coverage is incomplete, otherwise `pass_with_findings` for advisory-only findings and `pass` for none, with structured finding counts by blocking status and impact.

Default child diagnostics retain only bounded lifecycle metadata and redacted provider error summaries. Each finished task also records a compact Review Debug Summary event (`supi-review` / `review-task`) with trustworthy lifecycle, usage, outcome, and explicit Reviewer Extension Set status only — no repository evidence, tool arguments, or inspected-resource claims. When `review.auditEnabled` is on, every task stores a private, seven-day local replay of provider-visible messages and tool output; omit thinking blocks/signatures and never include raw replay content in normal review output. `supi_review_audit` is registered only after enabling the setting and reloading.

## Main files

- `src/tool/review-workflow.ts` — Direct/Prepared orchestration and Review Workspace boundary
- `src/workspace/review-workspace.ts` — linked-worktree materialization and best-effort cleanup
- `src/workspace/review-workspace-cleanup.ts` — marked-worktree recovery inventory/removal
- `src/workspace/cleanup-command.ts` — `/supi-review-cleanup`
- `src/tool/review-runner.ts` — Reviewer child, optional replay capture, and structured delivery
- `src/audit/` — private seven-day local replay persistence and trace capture
- `src/tool/child-session-runner.ts` — owned AgentSession runtime lifecycle
- `src/target/` — target resolution, canonical patches, changed-path metadata, Reviewer Packets

## Testing seams

Use the agreed seams:

1. `runReview` with real temporary Git repositories and a fake Reviewer Session boundary
2. Review Workspace materialization/cleanup against real Git
3. Review Plan lease and Review Snapshot drift behavior
4. Headless Code Intelligence registration and Workspace provider-host leases
5. `/supi-review-cleanup` command and picker behavior

Run package Vitest and source/test TypeScript builds while iterating, then `pnpm verify:ai`.
