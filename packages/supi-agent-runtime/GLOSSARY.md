# supi-agent-runtime

Runs in-process PI sessions and owns the shared session-local run registry, transcript store, and `/agents` viewer for its adapters.

## Language

**Agent Run**:
One managed AgentSession execution from creation and binding through completion and disposal. It has isolated conversation context but shares the containing PI process's operating-system permissions and external sandbox.
_Avoid_: Subagent process, sandbox, Reviewer Session, delegation task

**Context Isolation**:
The separation of one Agent Run's conversation and loaded PI resources from its containing session and sibling runs. It is not filesystem, process, credential, or permission isolation.
_Avoid_: Sandbox, read-only environment, process isolation

**Agent Session Inputs**:
The caller-owned cwd, model, provider authority, thinking level, tools, custom tools, resources, settings, and starting conversation context from which the runtime creates an Agent Run. The caller owns resource policy; the runtime owns session mechanics.
_Avoid_: Runtime policy, child configuration, session adapter

**Provider Authority**:
The caller-owned provider, credential, and model-resolution authority used to execute an Agent Run. The runtime creates a private PI ModelRuntime that delegates the selected provider, request authentication, headers, environment, and OAuth refresh to this authority. The Agent Run does not inherit conversation or resource policy, and the caller owns any permitted mutation.
_Avoid_: API key, model configuration, runtime policy

**Agent Run Outcome**:
The terminal success, failure, cancellation, or timeout result of one Agent Run, including all model usage billed during that execution and bounded diagnostics.
_Avoid_: Batch result, tool result, agent response

**Agent Run Result Readiness**:
The boundary at which an Agent Run's task completion, task Usage, and retained follow-up context are fixed and available to its caller. It can precede an optional Agent Run Retrospective and final Agent Run completion.
_Avoid_: Terminal outcome, Session Readiness Check, Agent Run Settlement

**Agent Run Retrospective**:
An optional self-assessment of an Agent Run's normally completed task, separate from its task result and retained follow-up context. Its observations and untested suggestions support later human-led tooling improvements.
_Avoid_: Retro facts, self-improvement, Delegation Follow-Up

**Agent Run Registry**:
The containing-session list of managed Agent and Reviewer runs. The runtime owns neutral display data, transcript access, and selected-run controls. Agent and Review packages keep their own policy.
_Avoid_: profile catalogue, review audit, process-wide history

**Run Batch**:
An ordered set of Agent Runs started by one request of one owner package and tracked together in the containing session. The owner keeps admission policy and the result format.
_Avoid_: Job, workflow, queue, Delegation Batch, Review

**Background Run Batch**:
A Run Batch whose caller continues before its Agent Run Outcomes are available. It belongs to the containing session and to the conversation branch that launched it, and it does not survive either.
_Avoid_: Async run, detached job, persistent worker

**Completion Notice**:
A parent-facing notice that results of a Background Run Batch are available for Result Collection. It identifies the batch, its tasks, and their terminal status, but carries no output or Usage. The owner chooses whether it is sent per task or once for the whole batch.
_Avoid_: Result payload, progress update, task result

**Result Collection**:
The caller's retrieval of available results from a Background Run Batch, in the owner's result format. It is repeatable, does not remove results, and is the only point at which the batch's Usage is reported to the parent.
_Avoid_: Completion notification, result consumption, polling

**Agent Run Transcript**:
The human-only record of finalized child-session messages, effective system prompts, and allowlisted lifecycle fields. It stays outside tool results and normal diagnostics.
_Avoid_: conversation summary, audit replay, model output

**Agent Run Transcript Store**:
The runtime-owned temporary store for transcripts from all registered runs in the containing session. It removes files at shutdown. Its retention does not depend on Review audit settings.
_Avoid_: Review audit store, persistent session history

**Session Readiness Check**:
A caller-owned post-bind, pre-prompt decision over the read-only session view. It lets each adapter require or deliberately degrade unavailable capabilities without moving session mechanics out of the runtime.
_Avoid_: Tool validation flag, observer exception, session preflight

**Agent Run Settlement**:
The point after the tracked initial prompt, extension sends started during its handling, and any PI continuation are idle. The runtime requires prompt completion plus PI idle and queue checks; it excludes work that an extension detaches and starts later.
_Avoid_: Prompt return, settled event, delayed extension work

**Completion Resolver**:
A caller-owned function that derives the domain completion value from a settled read-only session view. Returning no value means the Agent Run settled without its required completion.
_Avoid_: Completion mode, result holder, output parser

**Finite Agent Run Continuation**:
A bounded caller-owned policy that selects declarative same-session steps after an accepted Agent Run settles without required completion. The runtime, not the caller, performs repeated prompts, exact tool replacement, authorized model switches, thinking changes, usage snapshots, and final disposal.
_Avoid_: Session controls, retry loop, mutable callback view

**Cancellation Fence**:
The synchronous point at which stop or timeout claims an Agent Run. The runtime closes extension-send admission, clears PI queues, and starts abort before awaiting. A steering call already inside PI is rechecked and any late queue write is cleared. PI context invalidation occurs during normal or forced disposal after `session_shutdown` gets its bounded attempt. After the fence, no queued turn or tool work may start and unpublished completion cannot win; active work proceeds only toward bounded disposal.
_Avoid_: Best-effort abort, graceful drain

**Bounded Agent Run Disposal**:
The finite teardown period after a Cancellation Fence. It leaves resources inactive and the outcome final, but an uncooperative callback may still finish without Agent Run authority.
_Avoid_: Full quiescence, process termination

**Agent Run Diagnostics**:
The bounded allowlisted lifecycle metadata and redacted provider-error summaries retained for a non-success Agent Run Outcome. It excludes conversation, repository evidence, tool arguments, and tool results.
_Avoid_: Transcript, replay, activity log, raw error

**Agent Run Progress**:
The current immutable status, turn count, tool-use count, and usage snapshot of an Agent Run. It excludes conversation and tool evidence.
_Avoid_: Event history, transcript, activity log

**Agent Run Observer**:
An optional caller-owned adapter that receives a read-only session view, effective system prompt, and render-only tool definitions for domain evidence such as review audit or a conversation viewer. Tool definitions omit execution functions. The runtime does not retain or add observer evidence to Agent Run Progress or normal diagnostics.
_Avoid_: Progress listener, session owner, transcript recorder

**Agent Run Handle**:
The sole public control interface returned by `startAgentRun()`, exposing separate task-result and terminal-outcome promises, current-snapshot progress subscription, active-only steering, and idempotent stopping without exposing lifecycle controls for the owned AgentSession. A completed stop means the Agent Run is terminal and its owned resources have undergone bounded disposal.
_Avoid_: Session handle, controller service, run promise wrapper
