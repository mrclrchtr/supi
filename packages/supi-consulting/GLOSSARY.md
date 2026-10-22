# supi-consulting

Runs bounded Consultations while keeping agent selection, workspace exposure, and observed evidence explicit.

## Language

**Consultation**:
One bounded request to a Consulting Agent that returns an answer and execution evidence. It can start a conversation or continue one through a Conversation Handle.
_Avoid_: Antigravity Run, Agent Run, child session

**Consulting Agent**:
An agent selected to perform a Consultation. Antigravity is the only supported Consulting Agent.
_Avoid_: Agent Profile, PI model provider, model

**Workspace Access**:
The caller's decision to expose the current PI workspace to a Consultation. A Consultation without Workspace Access uses the selected agent's Consultation Workspace.
_Avoid_: consult mode, explore mode, repository mode

**Consultation Workspace**:
A package-managed empty project for Consultations without access to the current PI workspace. Its stable identity keeps agent-specific permissions and conversations separate from the current workspace.
_Avoid_: temporary workspace, sandbox, current workspace

**Web Capability**:
A Consulting Agent's permission-controlled ability to retrieve external sources during a Consultation. SuPi exposes and observes this capability but does not grant it.
_Avoid_: SuPi web search, automatic web access, web mode

**Isolated Antigravity Home**:
The package-owned Antigravity profile that separates configuration, authentication, customizations, and conversation state from the user's normal Antigravity profile. It stays stable across Consultations so Conversation Handles can continue.
_Avoid_: user home, temporary home, sandbox

**Inspection Permission Set**:
The Antigravity rules that allow external reads and deny known file, command, MCP, and browser-actuation paths. They limit Antigravity tools but are not an operating-system sandbox and do not control project-local hooks.
_Avoid_: read-only mode, safe mode, SuPi permissions

**Model Catalogue**:
The immutable model choices available through one Consulting Agent for the current session. A new Consultation selects one entry explicitly.
_Avoid_: PI model list, default model, all provider models

**Observed Evidence**:
Bounded execution facts derived from Consulting Agent tool activity and validated result references. Model claims alone are not Observed Evidence.
_Avoid_: claimed evidence, answer citations, raw event stream

**Web Evidence**:
Observed Evidence that contains successful web tool activity and at least one validated source URL.
_Avoid_: source list, cited answer, web claim

**Workspace Evidence**:
Observed Evidence that contains successful workspace inspection activity and validated workspace-relative paths.
_Avoid_: code claim, file list, exploration output

**Conversation Handle**:
An opaque SuPi identifier for an observed conversation with one Consulting Agent. It retains the original agent, model, working directory, and Workspace Access.
_Avoid_: raw conversation ID, Agent Run Handle, session ID
