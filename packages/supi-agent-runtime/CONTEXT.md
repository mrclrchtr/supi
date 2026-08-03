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
The caller-owned cwd, model, thinking level, tools, custom tools, ResourceLoader, and SettingsManager from which the runtime creates an Agent Run. The caller owns resource policy; the runtime owns session mechanics.
_Avoid_: Runtime policy, child configuration, session adapter

**Agent Run Outcome**:
The terminal success, failure, cancellation, or timeout result of one Agent Run, including all model usage billed within its owned session and bounded diagnostics.
_Avoid_: Batch result, tool result, agent response

**Session Readiness Check**:
A caller-owned post-bind, pre-prompt decision over the read-only session view. It lets each adapter require or deliberately degrade unavailable capabilities without moving session mechanics out of the runtime.
_Avoid_: Tool validation flag, observer exception, session preflight

**Completion Resolver**:
A caller-owned function that derives the domain completion value from a settled read-only session view. Returning no value means the Agent Run settled without its required completion.
_Avoid_: Completion mode, result holder, output parser

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
