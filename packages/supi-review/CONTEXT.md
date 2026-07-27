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
A two-step review in which preparation creates a session-scoped, one-shot Review Plan before caller-approved Review Tasks are executed.
_Avoid_: generated review, mandatory planning

**Review Plan**:
The package-owned artifact tying a resolved target, model choices, and optional planning provenance to one review execution. A Prepared Review exposes it by id, while a Direct Review creates it internally.
_Avoid_: review prompt, review result

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
A review target comparing `HEAD` with the files currently present in the checkout, plus non-ignored untracked files, regardless of staging state. A temporary `HEAD`-seeded index prevents the caller's real index and index flags from becoming evidence.
_Avoid_: layered index review, commit-candidate review

**Task Verdict**:
The Review Engine-derived `pass` or `issues` result for one completed Review Task, based only on whether that task reported a finding that blocks acceptance.
_Avoid_: reviewer verdict, run-level verdict, proof of correctness

**Child Lifecycle Trace**:
A bounded, ordered diagnostic record of lifecycle transitions for one child session. It contains allowlisted control metadata and never child-generated conversation, error, or tool content.
_Avoid_: recent events, event log, child transcript, telemetry
