# supi-agents

Runs user-requested delegation through managed Agent Runs while keeping profiles, workspace policy, and results explicit.

## Language

**Agent Profile**:
A named user or trusted-project policy that supplies an Agent Run's instructions, model preferences, and allowed tools.
_Avoid_: Agent type, role, preset

**Profile Directory**:
A self-contained Agent Profile definition containing a `profile.json` settings manifest and optional Markdown prompt assets. Package, global, and trusted-project Profile Directories are separate sources rather than entries in shared SuPi configuration.
_Avoid_: Profile file, agents config entry, profile bundle

**Profile ID**:
The stable name of a Profile Directory and the identifier used by Delegation Tasks. A higher-precedence package, global, or trusted-project source replaces the complete lower definition with the same ID; profiles never merge across sources.
_Avoid_: Profile name field, agent name, source-qualified profile

**Profile Catalogue**:
The immutable, maximum-32 set of effective Agent Profiles and Profile Diagnostics resolved for one extension runtime at session start or reload. The first 32 sorted Profile IDs enter the model-facing schema; additional IDs are unavailable with diagnostics, and source provenance remains human-facing metadata.
_Avoid_: Live profile registry, discovered agents

**Profile Diagnostic**:
A bounded configuration error that makes one discovered Profile ID unavailable. An invalid higher-precedence definition continues to shadow lower definitions; diagnostics appear in the planned `/agents` overlay and SuPi debug events, not model-facing guidance or startup notifications.
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

**Delegation Batch**:
An ordered set of independent Delegation Tasks accepted only when every selected profile and policy resolves successfully. Every task in a valid read-only multi-task batch starts concurrently without a queue; canceling the batch cancels every active Agent Run in it.
_Avoid_: Workflow, chain, DAG

**Mutation-Capable Profile**:
An Agent Profile whose allowed tools can change workspace state. It is eligible only for a single-task Delegation Batch.
_Avoid_: Writer agent, unsafe profile

**Read-Only Profile**:
An Agent Profile restricted to tools that cannot intentionally change workspace state.
_Avoid_: Safe profile, inspection-only reviewer
