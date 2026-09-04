# supi-antigravity

Runs bounded Antigravity tasks from PI while keeping workspace exposure and observed evidence explicit.

## Language

**Antigravity Run**:
One bounded request to Antigravity that returns one answer and execution evidence. It is external to PI and is not a PI Agent Run.
_Avoid_: Agent Run, child session, Antigravity session

**Workspace Access**:
The caller's decision to expose the current PI workspace to an Antigravity Run. A run without Workspace Access uses the Consultation Workspace.
_Avoid_: consult mode, explore mode, repository mode

**Consultation Workspace**:
A package-managed empty project that lets an Antigravity Run operate without access to the current PI workspace. Its stable project identity supports user-owned Antigravity permissions without a global permission change.
_Avoid_: temporary workspace, sandbox, current workspace

**Web Capability**:
Antigravity's permission-controlled ability to retrieve external sources during an Antigravity Run. SuPi exposes and observes this capability but does not grant it.
_Avoid_: SuPi web search, automatic web access, web mode

**Isolated Antigravity Home**:
The package-owned Antigravity profile that keeps configuration, authentication, customizations, and conversation state separate from the user's normal Antigravity profile. On macOS, it also owns a private keychain exposed as the login keychain for Antigravity credentials. It is stable across Antigravity Runs so Conversation Handles can continue.
_Avoid_: user home, temporary home, sandbox

**Inspection Permission Set**:
The rules in the Isolated Antigravity Home that allow external reads and deny known file, command, MCP, and browser-actuation paths. It limits Antigravity tools but is not an operating-system sandbox, and project-local hooks remain outside this guarantee.
_Avoid_: read-only mode, safe mode, SuPi permissions

**Model Catalogue**:
The package-owned model choices that are also available to the current Antigravity account. A new Antigravity Run selects one catalogue entry explicitly.
_Avoid_: all Antigravity models, PI model list, default model

**Observed Evidence**:
Bounded execution facts derived from Antigravity tool events and validated result references. Model claims alone are not Observed Evidence.
_Avoid_: claimed evidence, answer citations, raw event stream

**Web Evidence**:
Observed Evidence that contains successful web tool activity and at least one validated source URL.
_Avoid_: source list, cited answer, web claim

**Workspace Evidence**:
Observed Evidence that contains successful workspace inspection activity and validated workspace-relative paths.
_Avoid_: code claim, file list, exploration output

**Conversation Handle**:
An opaque SuPi identifier for one Antigravity conversation that retains its original model and Workspace Access. A handle can continue only the conversation that `supi-antigravity` observed and recorded.
_Avoid_: conversation ID, session ID, resume token

**Walking Skeleton**:
The smallest production-shaped `supi-antigravity` package that can complete and verify one Antigravity Run through its intended PI tool interface. It is retained and hardened rather than discarded as prototype code.
_Avoid_: throwaway prototype, experiment, complete package
