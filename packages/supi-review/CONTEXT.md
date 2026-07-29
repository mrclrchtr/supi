# supi-review

Runs caller-defined review tasks over a selected Git change through managed, inspection-only Reviewer Sessions. It supports direct execution and an optional planning step without letting callers replace the common execution and result protocol.

See also: root `CONTEXT.md` for project-wide terms.

## Language

**Review Engine**:
The package-owned machinery that resolves review targets, compiles reviewer packets, runs reviewer sessions, and validates their results.
_Avoid_: parent, host, prompt generator, review methodology

**Reviewer Protocol**:
The fixed, package-owned behavioral and delivery rules every Reviewer Session follows independently of its Review Task and repository content.
_Avoid_: system prompt, caller instructions

**Reviewer Session**:
A managed child agent that executes exactly one Review Task in the batch's shared Review Workspace. It shares the containing Pi process's trust boundary and follows the Reviewer Protocol without per-session write isolation.
_Avoid_: reviewer sub-agent, review sandbox

**Review Workspace**:
A clean, disposable registered Git worktree that freezes one verified Review Target's after-state for a concurrent review batch. It is visible in Git while active and removed best-effort afterward; later caller edits and reviewer-generated dependency state are not Target Evidence.
_Avoid_: live worktree, per-reviewer checkout, child sandbox

**Review Workspace Receipt**:
The compact post-materialization proof attached to every review batch. It records the target mode, baseline, expected and observed checkout, canonical patch hashes, and changed-path count after the linked worktree is reconstructed; it is evidence that children began from the selected target, not a post-review mutation audit.
_Avoid_: workspace path, cleanup receipt, reviewer activity log

**Review Workspace Cleanup**:
The explicit recovery operation for multi-selecting and removing SuPi-marked Review Workspaces left by interrupted or failed cleanup. Apparently active owners require an extra warning, liveness is advisory, and each selected removal reports its own outcome.
_Avoid_: automatic pruning, age-based cleanup, transactional cleanup

**Dependency Bootstrap**:
A dependency command inside a Review Workspace when Code Intelligence needs local dependencies. When `review.bootstrapCommand` is configured, the Review Engine runs it once before reviewer fan-out and reviewers receive no bootstrap instruction; otherwise it is reviewer-chosen. Generated state is contextual; Target Evidence mutation is prevented by instruction, not enforcement or post-command checking.
_Avoid_: workspace replication, setup phase, verification command

**Sandboxed Pi Environment**:
An external operating-system or container boundary around the whole Pi process, including Reviewer Sessions and extension tools. It contains only data and credentials acceptable for reviewer-model access and is required rather than supplied or detected by the Review Engine.
_Avoid_: child sandbox, in-process sandbox

**Inspection-only**:
A behavioral protocol that permits repository inspection and Dependency Bootstrap but forbids intentional changes to Target Evidence or Git history. It is not an access-control guarantee; the Reviewer Session's shell remains technically capable of writing inside the shared Review Workspace.
_Avoid_: read-only, sandboxed, write-protected

**Reviewer Extension Set**:
The fixed, package-owned extensions requested for every Reviewer Session: currently only the headless Code Intelligence inspection profile under the containing session's project-trust decision. Registration failure falls back to direct read and shell inspection with a Reviewer Capability Warning; unrelated extensions and non-extension resources remain excluded.
_Avoid_: ambient extensions, inherited tools, caller-selected extensions

**Reviewer Capability Warning**:
A bounded parent-facing notice that a requested Reviewer Extension Set capability was unavailable and the task continued with direct read and shell inspection. It is execution provenance, not a finding and does not determine the Task Verdict.
_Avoid_: review finding, provider diagnostic, task failure

**Review Task**:
One independent, caller-defined review objective identified by a stable id, freeform instructions, and optional Finding Scope. Each task produces its own result and verdict.
_Avoid_: Reviewer Assignment, Review Track, instruction block

**Review Criteria**:
Caller-authorized repository standards or specifications used to evaluate Target Evidence. They never have authority over the Reviewer Protocol or Review Task.
_Avoid_: repository instructions, ambient context

**Finding Scope**:
Per-Review Task eligibility policy: `change-only` limits findings to issues attributable to the Review Target, while `boy-scout` also admits pre-existing issues in changed files or reviewer-judged directly affected symbols. Purely pre-existing Boy Scout findings are advisory.
_Avoid_: review mode, repository audit

**Direct Review**:
A review that receives a target and complete set of Review Tasks in one execution request, without exposing a separate preparation step.
_Avoid_: manual review, unprepared review

**Prepared Review**:
A two-step review in which preparation creates a session-scoped Review Plan before caller-approved Review Tasks are executed. A plan is one-shot after any task completes but retryable after an all-non-completed batch.
_Avoid_: generated review, mandatory planning

**Review Plan**:
The package-owned artifact tying an exact Review Snapshot, model choices, and optional planning provenance to Prepared Review execution. Execution leases it, invalidates it on target drift, consumes it after any completed Review Task, and releases it after an all-non-completed batch.
_Avoid_: review prompt, review result, disposable request

**Reviewer Packet**:
The canonical, protocol-versioned input compiled for one Review Task from its resolved target, effective review input, and reviewer model. Direct and Prepared adapters share one compiler, and each result carries the SHA-256 of the exact packet bytes.
_Avoid_: caller prompt, methodology template, mutable brief

**Review Provenance**:
The separate record of execution mode (`direct` or `prepared`) and input origin (`caller-supplied` or `planner-assisted`). It does not imply a run-level verdict.
_Avoid_: review profile, aggregate decision

**Planner Draft**:
An optional advisory proposal of shared context and Review Tasks generated from bounded session conversation and target metadata. It is not evidence that the implementation was inspected or verified.
_Avoid_: generated prompt, synthesized brief, reviewer output

**Target Evidence**:
Repository evidence belonging to the resolved before and after states of a Review Target. Git objects establish the resolved states, and the Review Workspace materializes the after-state so direct filesystem and Code Intelligence observations refer to the same target.
_Avoid_: caller-checkout evidence, tool-dependent evidence authority

**Working-Tree Review**:
A review target comparing `HEAD`, or the merge base of an optional base commit and captured `HEAD`, with all current non-ignored worktree files as one net change. Caller staging is not evidence; its Review Workspace checks out the baseline and stages the canonical patch only as a materialization detail.
_Avoid_: layered index review, commit-candidate review, cwd-scoped review

**Task Verdict**:
The Review Engine-derived `pass` (no findings), `pass_with_findings` (advisory findings only), or `issues` (one or more blocking findings) result for one completed Review Task. It includes structured finding counts by blocking status and impact.
_Avoid_: reviewer verdict, run-level verdict, proof of correctness

**Review Output Artifact**:
A bounded, session-scoped copy of complete parent-facing preparation or review text. The first page carries its opaque id; `supi_review_output` retrieves repeatable continuation pages until expiry or eviction.
_Avoid_: review result, transcript, permanent report

**Child Lifecycle Trace**:
A bounded, ordered diagnostic record of lifecycle transitions for one child session. It contains allowlisted control metadata and may contain bounded, redacted provider-owned error summaries. It never contains assistant conversation, repository evidence, tool arguments, or tool results.
_Avoid_: recent events, event log, child transcript, telemetry

**Child Run Outcome**:
The typed result of running one isolated child session (planner or reviewer): a `success` carrying the structured `value` and aggregate usage, or a `canceled`, `timeout`, or `failed` outcome carrying bounded Child Failure diagnostics. It is substrate-level — it carries no model id, Reviewer Capability Warning, or audit reference; adapters attach those when mapping it to a run result. `session-creation-failed` is a diagnostics-free `failed`.
_Avoid_: reviewer output, run result, result-builder callbacks

**Local Reviewer Replay**:
A private local artifact for tuning a Reviewer Session. It retains provider-visible messages and tool output, packet/protocol text, timing, usage, and the Review Workspace Receipt for seven days; thinking blocks and thought signatures are omitted. It is disabled by default; enabling `review.auditEnabled` records every task and registers `supi_review_audit` after reload.
_Avoid_: normal review output, child diagnostics, permanent transcript
