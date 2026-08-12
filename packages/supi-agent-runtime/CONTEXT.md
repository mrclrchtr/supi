# supi-agent-runtime

Runs exactly one in-process PI agent session behind a neutral lifecycle interface for extension-owned adapters.

## Language

**Agent Run**:
One managed AgentSession execution from creation and binding through completion and disposal. It has isolated conversation context but shares the containing PI process's operating-system permissions and external sandbox.
_Avoid_: Subagent process, sandbox, Reviewer Session, delegation task

**Context Isolation**:
The separation of one Agent Run's conversation and loaded PI resources from its containing session and sibling runs. It is not filesystem, process, credential, or permission isolation.
_Avoid_: Sandbox, read-only environment, process isolation

**Agent Session Inputs**:
The caller-owned cwd, model, provider authority, thinking level, tools, custom tools, resources, and settings from which the runtime creates an Agent Run. The caller owns resource policy; the runtime owns session mechanics.
_Avoid_: Runtime policy, child configuration, session adapter

**Provider Authority**:
The caller-owned provider, credential, and model-resolution authority used to execute an Agent Run. The runtime creates a private PI ModelRuntime that delegates the selected provider, request authentication, headers, environment, and OAuth refresh to this authority. The Agent Run does not inherit conversation or resource policy, and the caller owns any permitted mutation.
_Avoid_: API key, model configuration, runtime policy

**Agent Run Outcome**:
The terminal success, failure, cancellation, or timeout result of one Agent Run, including all model usage billed within its owned session and bounded diagnostics.
_Avoid_: Batch result, tool result, agent response

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
The synchronous point at which stop or timeout claims an Agent Run. The runtime closes extension-send admission, clears PI queues, and starts abort before awaiting. A steering call already inside PI is rechecked and any late queue write is cleared. PI context invalidation occurs during normal or forced disposal after `session_shutdown` gets its bounded attempt. After the fence, no queued turn or tool work may start and completion cannot win; active work proceeds only toward bounded disposal.
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
An optional caller-owned adapter that receives a read-only session view for domain-specific evidence such as review audit or a conversation viewer. The runtime does not retain or add this evidence to Agent Run Progress or normal diagnostics.
_Avoid_: Progress listener, session owner, transcript recorder

**Agent Run Handle**:
The sole public control interface returned by `startAgentRun()`, exposing the outcome promise, current-snapshot progress subscription, active-only steering, and idempotent stopping without exposing lifecycle controls for the owned AgentSession. A completed stop means the Agent Run is terminal and its owned resources have undergone bounded disposal.
_Avoid_: Session handle, controller service, run promise wrapper
