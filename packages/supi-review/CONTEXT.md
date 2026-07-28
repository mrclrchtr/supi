# supi-review

Runs caller-defined review tasks over a selected Git change through managed, read-only reviewer sessions. It supports direct execution and an optional planning step without letting callers replace the common execution and result protocol.

See also: root `CONTEXT.md` for project-wide terms.

## Language

**Review Engine**:
The package-owned machinery that resolves review targets, compiles reviewer packets, runs reviewer sessions, and validates their results.
_Avoid_: host, prompt generator, review methodology

**Review Task**:
One independent, caller-defined review objective identified by a stable id and freeform instructions. Each task produces its own result and verdict.
_Avoid_: Reviewer Assignment, Review Track, instruction block

**Direct Review**:
A review that receives a target and complete set of Review Tasks in one execution request, without exposing a separate preparation step.
_Avoid_: manual review, unprepared review

**Prepared Review**:
A two-step review in which preparation creates a session-scoped Review Plan before caller-approved Review Tasks are executed. A plan is one-shot after any task completes but retryable after an all-non-completed batch.
_Avoid_: generated review, mandatory planning

**Review Plan**:
The package-owned artifact tying a resolved target, model choices, and optional planning provenance to Prepared Review execution. A valid execution leases it against concurrent calls. Any completed Review Task consumes it; an all-failed or all-canceled batch releases it for retry.
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

**Working-Tree Review**:
A review target comparing a resolved baseline with the files currently present in the whole Git worktree, plus non-ignored untracked files, regardless of staging state or Pi's launch subdirectory. The baseline is `HEAD` by default or the merge base of an optional caller-supplied base commit and captured `HEAD`, allowing committed branch work and uncommitted work to form one net target. A temporary `HEAD`-seeded index augmented with baseline-only tracked entries prevents the caller's real index and index flags from becoming evidence while preserving direct baseline-to-filesystem comparisons.
_Avoid_: layered index review, commit-candidate review, cwd-scoped review

**Task Verdict**:
The Review Engine-derived `pass` or `issues` result for one completed Review Task, based only on whether that task reported a finding that blocks acceptance.
_Avoid_: reviewer verdict, run-level verdict, proof of correctness

**Review Output Artifact**:
A bounded, session-scoped copy of complete parent-facing preparation or review text. The first page carries its opaque id; `supi_review_output` retrieves repeatable continuation pages until expiry or eviction.
_Avoid_: review result, transcript, permanent report

**Child Lifecycle Trace**:
A bounded, ordered diagnostic record of lifecycle transitions for one child session. It contains allowlisted control metadata and may contain bounded, redacted provider-owned error summaries. It never contains assistant conversation, repository evidence, tool arguments, or tool results.
_Avoid_: recent events, event log, child transcript, telemetry
