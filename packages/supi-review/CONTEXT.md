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
A clean, disposable registered Git worktree that freezes one verified Review Target's reviewed state for a concurrent review batch. It is visible in Git while active and removed best-effort afterward; later caller edits and reviewer-generated dependency state are not Target Evidence.
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
A behavioral protocol that permits repository inspection, read-only retrieval of identified Review Criteria Sources, and Dependency Bootstrap, but forbids intentional changes to Target Evidence or Git history. Test verification means inspecting test code and requirement coverage; runtime checks are delegated to the containing Agent. It is not an access-control guarantee.
_Avoid_: read-only, sandboxed, write-protected, runtime verification, general web research

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
Caller-authorized requirements used to evaluate Target Evidence. They may be summarized in a Reviewer Packet but derive from identified authoritative sources, and they never have authority over the Reviewer Protocol or Review Task.
_Avoid_: repository instructions, ambient context, task summary

**Review Criteria Source**:
A caller-identified authoritative issue or repository document from which Review Criteria derive. A reviewer may retrieve it when the supplied summary is insufficient; unavailable required source content makes Criteria Coverage incomplete.
_Avoid_: shared context, Reviewer Packet, Review Scope

**Criteria Coverage**:
A required completed Review Task statement that the supplied Review Criteria were sufficient for the audit, or that unavailable source detail left coverage incomplete for a stated reason. Incomplete coverage preserves concrete findings but cannot support a definitive pass.
_Avoid_: proof that every source was fetched, task failure, Reviewer Capability Warning, finding count

**Review Scope**:
Caller-supplied workspace-relative file or directory paths that focus a Current-State Audit without restricting inspection or finding eligibility. Reviewers may inspect any related code and report any finding relevant to the Review Criteria.
_Avoid_: module identifier, test-suite identifier, access boundary, finding boundary, Review Criteria, Finding Scope

**Finding Scope**:
The finding-eligibility policy for a Review Task. Git change reviews choose `change-only` or `boy-scout`; Current-State Audit uses fixed `criteria-only`, where any criterion-relevant finding may block acceptance regardless of when it was introduced.
_Avoid_: review mode, Review Scope, repository audit

**Finding Verification**:
The containing Agent's independent confirmation or refutation of each reported finding against Target Evidence before any mutation. It concludes by presenting the verified findings and asking the user what to do next.
_Avoid_: Reviewer Session, review rerun, fixing

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
Repository evidence belonging to the resolved state or states of a Review Target. Change reviews have before and after states; a Current-State Audit has one reviewed state materialized by the Review Workspace.
_Avoid_: caller-checkout evidence, tool-dependent evidence authority

**Working-Tree Review**:
A review target comparing `HEAD`, or the merge base of an optional base commit and captured `HEAD`, with all current non-ignored worktree files as one net change. Caller staging is not evidence; its Review Workspace checks out the baseline and stages the canonical patch only as a materialization detail.
_Avoid_: layered index review, commit-candidate review, cwd-scoped review

**Current-State Audit**:
A one-state review of the frozen current filesystem, including unstaged and uncommitted work, against Review Criteria without attributing findings to a Git change. Reviewers may inspect unchanged related code as context.
_Avoid_: Current-Tree Audit, Working-Tree Review, scoped diff, HEAD review

**Task Verdict**:
The Review Engine-derived result for one completed Review Task: `issues` when any finding blocks acceptance; otherwise `incomplete` when Criteria Coverage is incomplete; otherwise `pass_with_findings` for advisory findings or `pass` for none. It includes structured finding counts by blocking status and impact.
_Avoid_: reviewer verdict, run-level verdict, proof of correctness

**Post-Review Disposition**:
A direct user instruction to ask, verify, verify and fix, fix, or only report the findings from the current review. It overrides the Post-Review Policy; generic authorization to edit code is not a disposition.
_Avoid_: Review Task, Finding Scope, Agent plan

**Post-Review Policy**:
The configured default for how the containing Agent responds to findings when no Post-Review Disposition exists. It applies consistently to interactive and agent-initiated reviews and defaults to asking the user.
_Avoid_: Reviewer Protocol, Review Task, Task Verdict

**Review Output Artifact**:
A bounded, session-scoped copy of complete parent-facing preparation or review text. The first page carries its opaque id; `supi_review_output` retrieves repeatable continuation pages until expiry or eviction.
_Avoid_: review result, transcript, permanent report

**Child Lifecycle Trace**:
A bounded, ordered diagnostic record of lifecycle transitions for one child session. It contains allowlisted control metadata and may contain bounded, redacted provider-owned error summaries. It never contains assistant conversation, repository evidence, tool arguments, or tool results.
_Avoid_: recent events, event log, child transcript, telemetry

**Review Debug Summary**:
A compact per-task Debug Event containing trustworthy lifecycle, usage, outcome, and explicit Reviewer Extension Set status without repository evidence or tool arguments. It does not claim which resources were inspected or that an LSP provider was ready.
_Avoid_: Local Reviewer Replay, reviewer conduct audit, LSP readiness report

**Child Run Outcome**:
The typed result of running one isolated child session (planner or reviewer): a `success` carrying the structured `value` and aggregate usage, or a `canceled`, `timeout`, or `failed` outcome carrying bounded Child Failure diagnostics. It is substrate-level — it carries no model id, Reviewer Capability Warning, or audit reference; adapters attach those when mapping it to a run result. `session-creation-failed` is a diagnostics-free `failed`.
_Avoid_: reviewer output, run result, result-builder callbacks

**Local Reviewer Replay**:
A private local artifact for tuning a Reviewer Session. It retains provider-visible messages and tool output, packet/protocol text, timing, usage, and the Review Workspace Receipt for seven days; thinking blocks and thought signatures are omitted. It is disabled by default; enabling `review.auditEnabled` records every task and registers `supi_review_audit` after reload.
_Avoid_: normal review output, child diagnostics, permanent transcript
