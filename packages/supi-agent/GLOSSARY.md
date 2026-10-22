# supi-agent

Runs user-requested delegation through managed Agent Runs while keeping profiles, workspace policy, and results explicit.

## Language

**Agent Profile**:
A named user or trusted-project policy that supplies an Agent Run's instructions, model preferences, and allowed tools.
_Avoid_: Agent type, role, preset

**Disabled Agent Profile**:
An Agent Profile that remains configured but is unavailable for selection or new Delegation Tasks.
_Avoid_: Deleted profile, hidden profile

**Profile Directory**:
A Profile Directory definition containing a partial `profile.json` settings manifest and optional Markdown prompt assets. Package, global, and trusted-project Profile Directories are separate sources rather than entries in shared SuPi configuration.
_Avoid_: Profile file, agents config entry, profile bundle

**Profile ID**:
The stable name of a Profile Directory and the identifier used by Delegation Tasks. Project, global, and package sources are resolved per field; omitted fields fall through to lower-precedence sources while lists remain whole-field values.
_Avoid_: Profile name field, agent name, source-qualified profile

**Profile Catalogue**:
The fixed collection of discovered Agent Profiles, their sources, availability, and Profile Diagnostics. Membership in the catalogue does not imply availability for Delegation Tasks.
_Avoid_: Live profile registry, discovered agents

**Profile Diagnostic**:
A bounded configuration error for one unavailable Profile Directory source or incomplete resolved Profile ID. Invalid sources are skipped as a whole, lower-precedence fields may supply the effective profile, and diagnostics appear in settings, startup warnings, and SuPi debug events without entering model-facing guidance.
_Avoid_: Profile warning, fallback notice, Agent Run failure

**Agent Capability Set**:
The fixed package-owned set of tools that Agent Profiles may select for Agent Runs. It includes PI built-ins and explicitly supported child-capable extensions, never ambient extensions.
_Avoid_: Inherited tools, parent tool set, extension allowlist

**Agent Prompt Policy**:
An Agent Profile's choice of one complete base prompt: PI-native, package-owned by Prompt ID, or a Custom System Prompt from the Profile Directory's `SYSTEM.md`.
_Avoid_: Prompt mode, system prompt type, layered prompt

**Custom System Prompt**:
The complete system prompt stored in a Profile Directory's `SYSTEM.md` and selected by `systemPrompt: "custom"`.
_Avoid_: Profile Prompt, Markdown body, appended instructions

**Agent Instruction Scope**:
One of the explicit `global` or `project` AGENTS.md/CLAUDE.md sources selected by an Agent Profile's required `instructionScopes` set. `project` uses PI's normal cwd-ancestry context discovery; PI SYSTEM.md and APPEND_SYSTEM.md files are not instruction-scope inputs.
_Avoid_: Applied context, prompt inheritance, resource mode

**Delegation Task**:
One caller-defined objective assigned to an Agent Profile and producing its own Agent Run Outcome independently of sibling tasks.
_Avoid_: Job, step, chain link

**Delegation Conversation**:
The retained child context shared by an initial Delegation Task and its later Delegation Follow-Ups, each with a separate Agent Run. Separate conversations can use the same Agent Profile, and each belongs to one containing session and remains available when that session is reopened.
_Avoid_: Agent Profile, persistent worker, shared agent memory

**Delegation Follow-Up**:
Additional caller instructions that start a new Agent Run from a Delegation Conversation's saved checkpoint, including after failure or cancellation. It uses the current policy for the same Profile ID and does not automatically repeat interrupted actions.
_Avoid_: Retry, interrupted-run recovery, active-run steering

**Delegation Checkpoint**:
The child conversation state associated with a stored Delegation Task Result. It identifies the context available to a later follow-up on the active parent branch.
_Avoid_: Conversation View, human transcript, memory summary

**Delegation Batch**:
An ordered set of independent Delegation Tasks accepted only when every selected profile and policy resolves successfully. Every task in a valid read-only multi-task batch starts concurrently without a queue; canceling the batch cancels every active Agent Run in it.
_Avoid_: Workflow, chain, DAG

**Background Delegation Batch**:
A Delegation Batch whose caller can continue before its Agent Run Outcomes are available. It belongs to the containing session.
_Avoid_: Async run, detached job, persistent worker

**Foreground Delegation Batch**:
A Delegation Batch whose caller waits until all of its Agent Run Outcomes are available.
_Avoid_: Synchronous run, blocking worker

**Delegation Task Result**:
The caller-facing terminal status, bounded output, and Usage for one Delegation Task. It is available independently of sibling tasks.
_Avoid_: Batch result, completion notice, Agent Run Outcome

**Delegation Completion Notice**:
A parent-facing notice that one or more Delegation Task Results are available for collection. It identifies the tasks and their terminal status but does not contain their output.
_Avoid_: Task result, result payload, progress update

**Delegation Result Collection**:
The caller's retrieval of available Delegation Task Results. It is separate from task completion and does not remove the results.
_Avoid_: Completion notification, result consumption, polling

**Delegation Batch Result**:
The ordered parent-facing result of a Delegation Batch. It has one aggregate model-output bound; each task remains represented, and its bounded final text and Conversation View stay in human details. A temporary Markdown spill holds bounded task text when needed. The full Agent Run Transcript is separate and never enters the tool result.
_Avoid_: unbounded joined output, transcript payload, continuation artifact

**Conversation View**:
The bounded human and model-facing summary of one Agent Run. It retains recent assistant text, steering, and safe tool summaries; it omits full tool output and private reasoning.
_Avoid_: full transcript, replay log

**Agent Run Transcript**:
The complete human-only sequence of finalized Agent Run messages, effective system prompts, and allowlisted lifecycle events. It is separate from Agent Run Progress and parent tool results; raw tool input and output stay hidden until the user opens them.
_Avoid_: model result, diagnostics, conversation summary

**Agent Run Transcript Store**:
The runtime-owned temporary JSONL store for Agent and Reviewer runs registered in the containing session. It has no application cap or restart recovery. It marks a failed capture incomplete, does not stop a run, and removes files at session shutdown.
_Avoid_: persistent session history, replay store

**Mutation-Capable Profile**:
An Agent Profile whose allowed tools can change workspace state. It is eligible only for a single-task Delegation Batch.
_Avoid_: Writer agent, unsafe profile

**Read-Only Profile**:
An Agent Profile restricted to tools that cannot intentionally change workspace state.
_Avoid_: Safe profile, inspection-only reviewer
