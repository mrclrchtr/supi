# supi-review

Caller-defined code review tasks run in managed, Inspection-only Reviewer Sessions.

## Product contract

- A Review executes one exact Review Target plus complete caller-owned Review Tasks. Each task must select Review Mode: `change` or `state`.
- Every Reviewer Packet carries the selected Repository Instruction Files before the task lines ([ADR 0019](docs/adr/0019-embed-repository-instruction-files-in-reviewer-packets.md)): the root file in full, deeper files as an index (path, SHA-256, lines, change status, coverage). `src/target/instruction-files.ts` selects them once per Review from the frozen workspace, using the caller's effective `instructionFileNames` and never the target's own config. A root file above `REVIEW_LIMITS.instructionFileBytes` fails before fan-out. State tasks drop indexed files selected only for changed paths (`instructionFilesForMode`). Headless Orientation is seeded only with the embedded root file, so it still delivers indexed files. Planner Drafts and Submission Recovery get none.
- Sources named in task `instructions` stay authoritative; reviewers may retrieve them read-only when the quoted rules are insufficient, and unavailable required detail yields structured incomplete Criteria Coverage. There is no `criteriaSources` field.
- `/supi-review` may create one transient Planner Draft from bounded session context. It re-resolves the captured Review Snapshot before execution and stops when the selected target changed.
- The Review Engine owns target resolution, canonical packets and hashes, Review Workspace lifecycle, structured submissions, usage accounting, and per-task Task Verdicts.
- One to four independent tasks share a single frozen Review Workspace and run concurrently. Results remain separate; never aggregate or rerank their verdicts.
- `review_run` defaults to a Background Review in TUI/RPC and a Foreground Review in print/JSON, where explicit background is rejected before any work ([ADR 0018](docs/adr/0018-run-reviews-in-the-background-by-default.md)). Background Reviews are runtime Run Batches (`src/background/`) with one Completion Notice per Review, collected through `agent_result`. `/supi-review` stays foreground.
- `review.postReviewPolicy` controls the containing Agent's prompt-level response to findings on both review surfaces; direct user disposition wins while `/supi-review` with `report` remains terminal.
- `review.reviewerCodemodeEnabled` defaults to `false`. When enabled, Reviewer investigation on both surfaces gets Pi codemode plus one invocation-scoped classifier/image catalogue shared across Reviewer children. This may transmit repository evidence to providers and incur costs; it does not inherit parent settings or grant additional tools, MCP servers, or ambient extensions. Planner Drafts and Submission Recovery never get codemode.

## Targets and Review Workspaces

- A Review Target selects at most one `workingTree` or `committed` source object. Omission, or an empty target, selects the current filesystem. The Review Engine resolves endpoint syntax once to exact full commits. It never substitutes a merge base for `from`: the target stays the exact two-dot comparison. When `from` is not an ancestor of the after commit, the snapshot records `divergedFrom` (with the merge base, when one exists), and both the Reviewer Packet and the parent-facing result warn about it.
- A `workingTree` change defaults `from` to captured `HEAD`. Its workspace checks out exact `from` and stages one canonical patch to the frozen filesystem, including non-ignored untracked files. The caller index is not evidence.
- A committed change requires explicit `from`; `to` defaults to `HEAD`. Its workspace checks out exact `to`.
- A state task receives only the frozen after state. An all-state batch rejects explicit `from` and can review a root `to`. A change task needs a non-empty canonical change; a committed change rejects a root `to`; a root `from` is valid.
- Materialization re-compiles the linked workspace through the canonical patch compiler. Its receipt records exact endpoint state, uncommitted-change inclusion, expected and observed checkout, patch hashes, and changed-path count. After that, the caller checkout can change without changing Target Evidence.
- For a target with a before commit and changes, materialization also writes a text diff to `target.diff` beside the workspace (never inside it) and indexes each path's start line. The Reviewer Packet names the file by its fixed relative path, so packet hashes stay reproducible. The canonical `--binary` patch stays the hashed evidence; the text copy is a reading aid.
- Workspaces are disposable Agent Workspaces from `@mrclrchtr/supi-agent-runtime/workspace`, locked with the `supi-agent:review:` marker; Review keeps target resolution, the canonical patch compiler, `target.diff`, and its receipt mapping. Cleanup is best-effort; Review registers the shared runtime `/supi-agent-cleanup` (`registerAgentCleanupCommand()`) for recovery and never auto-prunes.

## Reviewer sessions

Reviewers receive Pi `read`, `bash`, `grep`, `find`, and `ls`, headless Code Intelligence (`code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_find`, `code_health`), and `submit_review`. When opted in, codemode runs in `on` mode with the same permitted inspection tools and the invocation's authorized auxiliary-model snapshot. Do not restore the five target-specific inspection tools.

Inspection-only is a prompt protocol, not access control. The surrounding Sandboxed Pi Environment is the security boundary. When `review.bootstrapCommand` is configured, the Review Engine performs that one Dependency Bootstrap before fan-out and reviewers receive no bootstrap instruction; otherwise they may choose one. Reviewers must not intentionally mutate Target Evidence or Git history; tests, builds, linters, runtime experiments, nested Pi, and nested reviews are outside protocol.

Reviewer resource loading goes through the runtime's `createIsolatedAgentResources()`: it replaces Pi's generic coding prompt with the package-owned Reviewer Protocol, keeps the active tools' usage rules, and suppresses ambient extensions, context files (instruction files reach Reviewers only through the packet), skills, prompt templates, themes, and discovered system prompts. The Reviewer Extension Set contains the Code Intelligence Headless inspection profile under the containing session's project-trust decision, plus Pi codemode only when `review.reviewerCodemodeEnabled` is true. Do not load MCP or inherit parent codemode settings. Keep `submit_review` and `decline_review_recovery` model-only so codemode scripts cannot invoke terminal submission tools. Missing requested capabilities leave the other permitted tools available and produce a Reviewer Capability Warning separate from findings.

## Submission Recovery

After an accepted Reviewer Packet settles with usable history but no valid structured submission, Agent Run can perform one low-thinking same-session turn on the original model and one optional turn on `review.recoveryModel`. Recovery uses exactly `submit_review` and `decline_review_recovery`; codemode is inactive even when Reviewer investigation opted in, and only those two terminal tools are active. It must not start after creation, readiness, preflight, cancellation, or timeout failure. Declined or exhausted recovery keeps the original failure and has no Task Verdict.

## Result grammar

`submit_review` returns a summary, ordered findings, and required structured Criteria Coverage. Parent-facing task output identifies Review Mode. Each finding has title, description, `blocksAcceptance`, impact, effort, confidence, and optional target-relative location. The Reviewer Protocol permits change findings attributable to the target and state findings relevant to the Review Criteria in the frozen after state. The Review Engine keeps `blocksAcceptance` unchanged and derives `issues` for any blocking finding, otherwise `incomplete` when Criteria Coverage is incomplete, otherwise `pass_with_findings` for advisory-only findings and `pass` for none, with structured finding counts by blocking status and impact.

Default child diagnostics retain only bounded lifecycle metadata and redacted provider error summaries. Each finished task also records a compact Review Debug Summary event (`supi-review` / `review-task`) with trustworthy lifecycle, usage, outcome, and explicit Reviewer Extension Set status, plus engine-observed counts of how the Reviewer reached indexed instruction files (`instructionFileUsage`) — no repository evidence, paths, tool arguments, or inspected-resource claims. When `review.auditEnabled` is on, every task stores a private, seven-day local replay of provider-visible messages and tool output; omit thinking blocks/signatures and never include raw replay content in normal review output. Register `review_audit` once and keep it active only while Agent tools and auditing are enabled. Artifact retrieval defaults to metadata-only Replay Outline. Selected-message and exact raw JSON views require explicit input and remain private evidence-bearing access.

## Runtime boundary

Review child setup is a thin adapter over `@mrclrchtr/supi-agent-runtime`. Keep Review resource, evidence, audit, and structured-completion policy here; shared Agent Run lifecycle mechanics stay in the runtime.

## Testing seams

Use the agreed seams:

1. `runReview` with real temporary Git repositories and a fake Reviewer Session boundary
2. Review Workspace materialization/cleanup against real Git
3. Inline Planner Draft provenance, failure, and Review Snapshot drift behavior
4. Headless Code Intelligence registration and Workspace provider-host leases
5. Review Workspace markers recognized by the runtime Agent Workspace inventory and cleanup
6. Reviewer codemode resource opt-in, shared auxiliary snapshot, no indirect submission exposure, and Planner/recovery exclusion
