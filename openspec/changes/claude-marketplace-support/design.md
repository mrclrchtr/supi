## Context

SuPi is already a pi package with multiple TypeScript extensions loaded directly at runtime. Pi's documented extension APIs give us the key primitives needed for a Claude marketplace bridge: `resources_discover` for dynamic prompt/skill path publication, `input` transforms and commands for invocation UX, custom tools for agent execution, `tool_call` and `user_bash` interception for shell adaptation, and session lifecycle hooks for caching and cleanup. The attached plan and pi docs both point toward an extension/package approach first, not a core fork.

The main constraint is fidelity without overcommitting. Claude plugins can include `commands/`, `skills/`, `agents/`, `hooks/`, `bin/`, `.mcp.json`, `.lsp.json`, and scoped settings. Pi can support several of those cleanly today, but not all of them with perfect parity. This design therefore targets an implementable v1 that preserves the most valuable plugin behavior while keeping the runtime understandable, reload-safe, and shippable inside this repository.

V1 explicitly targets the currently documented and observed Claude plugin layout centered on `.claude-plugin/plugin.json` plus optional `commands/`, `skills/`, `agents/`, `hooks/hooks.json`, and `bin/` directories. The bridge must treat this layout as compatibility input rather than a stable public API: unsupported or changed layouts should degrade into warnings/status output instead of partial silent activation.

## Goals / Non-Goals

**Goals:**
- Discover Claude plugins from supported scopes and resolve which plugins are effectively enabled for the current cwd
- Surface enabled plugin commands and skills inside pi with deterministic, collision-safe namespacing
- Execute plugin-provided agents through an isolated subprocess-based runtime using pi's extension model
- Adapt supported Claude command hooks onto pi lifecycle and tool events without destabilizing the host session
- Inject enabled plugin `bin/` directories into bash execution environments in a visible, scope-aware way
- Provide a status/debug command so users can inspect the active marketplace bridge state
- Keep the implementation as a normal SuPi extension with no pi core changes and no build step

**Non-Goals:**
- Forking pi core
- Full Claude Code UX parity
- Bridging plugin `.lsp.json`
- MCP parity in v1
- Installing or updating Claude plugins from inside pi
- Background or resumable agent jobs in v1
- Perfect support for all Claude hook types; v1 only targets command hooks

## Decisions

### 1. Add a dedicated `claude-marketplace/` extension stack inside this package

**Decision**: Implement the bridge as a new multi-file extension directory registered from `package.json`, with focused modules for registry, resources, agents, hooks, PATH integration, status formatting, and shared types.

**Rationale**: This matches SuPi's existing structure and keeps marketplace support independently reviewable. It also aligns with pi package guidance: advanced behavior should live in extensions/packages rather than in pi core.

**Alternatives considered**:
- **Fork pi**: rejected for v1 because current extension APIs already cover discovery, hooks, custom tools, and subprocess execution.
- **One large file**: rejected because registry, resources, agents, and hooks each have enough logic to deserve separate modules.

### 2. Build around a normalized plugin registry with explicit scope and compatibility resolution

**Decision**: Create a registry that scans supported Claude plugin locations, parses `.claude-plugin/plugin.json`, validates the plugin against the supported v1 layout, inspects Claude install/settings metadata, and produces one normalized record per plugin containing scope, source path, compatibility status, enabled state, and discovered components.

Authoritative enablement inputs for v1 are:
- install inventory from Claude's `installed_plugins.json`
- user scope settings from `~/.claude/settings.json`
- project scope settings from `.claude/settings.json`
- local override settings from `.claude/settings.local.json`

Effective precedence is `settings.local` → project `settings.json` → user `settings.json` → install inventory defaults. More specific scope wins for the current cwd.

**Rationale**: Every other feature depends on the same source of truth. A normalized registry prevents each subsystem from reparsing manifests or reinventing scope logic. Making the supported file inputs and precedence explicit resolves ambiguity before implementation.

**Alternatives considered**:
- **Direct filesystem reads inside each subsystem**: rejected because it duplicates logic and makes reload behavior inconsistent.
- **Only support one plugin scope**: rejected because preserving user/project/local enablement semantics is part of the goal.
- **Assume all discovered plugins are compatible forever**: rejected because Claude's plugin filesystem is an external moving target and needs explicit compatibility checks.

### 3. Materialize generated wrappers through documented `resources_discover` behavior

**Decision**: Use pi's documented `resources_discover` event to publish a generated prompt directory under a runtime cache location. Generate wrappers for enabled plugin commands as `/plugin-id:command-name` and for plugin skills as `/plugin-id:skill:skill-name`.

Skill wrappers must preserve progressive-disclosure behavior as much as possible in a prompt-based bridge by:
- carrying forward the plugin skill description/provenance into the generated wrapper
- instructing the agent to read the original plugin `SKILL.md`
- preserving pointers to plugin `references/` content for on-demand reading rather than inlining entire skill trees

**Rationale**: Pi prompt templates are global per session, so raw Claude resources need namespacing. Using generated wrappers keeps the bridge reload-safe, avoids mutating the plugin sources, and sidesteps pi skill-directory validation for plugin skills. The `resources_discover` API is documented by pi, but the wrapper publication and reload behavior should still be validated with a targeted spike before full implementation.

**Alternatives considered**:
- **Expose raw plugin markdown directly**: rejected because name collisions and provenance confusion are likely.
- **Generate native pi skill directories for plugin skills**: deferred because pi skill validation and naming rules make this noticeably more fragile.
- **Input-transform-only dispatch for everything**: rejected because discoverability through normal command lists matters.

### 4. Use a custom agent tool backed by pi's subprocess subagent pattern

**Decision**: Register a `claude_plugin_agent` tool that executes a namespaced plugin agent in a separate pi subprocess, with the tool receiving the agent name and task. Only foreground execution is supported in v1.

**Rationale**: Pi's official subagent example already validates the subprocess approach and gives us isolated context windows without core changes. A single tool is simpler and safer than inventing multiple invocation paths up front. Because SuPi does not yet use subagents elsewhere, implementation should start with a narrow proof-of-concept that validates filtered tools, turn limits, streaming, and result collection.

**Alternatives considered**:
- **Dynamic slash commands for every plugin agent**: deferred until the runtime proves useful; the tool-first path is easier to test and document.
- **Depend on a full-featured third-party subagent package**: rejected for v1 because it introduces more UX and runtime surface than this bridge needs.
- **In-process agent execution**: rejected because isolation is one of the main benefits of the subagent pattern.

### 5. Support only `type: "command"` hooks in v1, using an internal focused runner

**Decision**: Parse plugin `hooks/hooks.json`, activate only command hooks for selected pi events, and run them through a small internal adapter inspired by `pi-hooks` rather than taking a hard dependency on it.

V1 mapping table:

| Claude hook event | Pi event source |
|---|---|
| `SessionStart` | `session_start` |
| `SessionEnd` | `session_shutdown` |
| `UserPromptSubmit` | `input` |
| `PreToolUse` | `tool_call` |
| `PostToolUse` | `tool_result` when `isError === false` |
| `PostToolUseFailure` | `tool_result` when `isError === true` |
| `Stop` | `agent_end` |

**Rationale**: Command hooks are the most valuable and best-understood compatibility slice. Reusing the pattern without taking the full dependency keeps the package smaller and lets registry-based enablement stay under our control. An explicit mapping table removes guesswork for implementation and tests.

**Alternatives considered**:
- **Depend directly on `pi-hooks`**: possible later, but avoided initially to reduce dependency and integration coupling.
- **Implement all Claude hook types now**: rejected because parity would expand quickly into HTTP/prompt/agent semantics that are not yet validated.

### 6. Inject plugin `bin/` paths by wrapping bash execution, not by changing global process state

**Decision**: Compute the active plugin `bin/` directories for the current cwd and prepend them to PATH for agent `bash` tool calls and `user_bash` commands. Order paths by specificity (`local` → `project` → `user`) and then by plugin id.

**Rationale**: This preserves scope semantics, keeps behavior deterministic, and avoids mutating the host process environment globally. It also makes PATH injection easy to explain and debug.

**Alternatives considered**:
- **Mutate `process.env.PATH` globally**: rejected because scope-specific plugin bins could leak across projects or sessions.
- **Ignore `user_bash`**: rejected because user shell commands should see the same enabled plugin binaries as agent shell commands.

### 7. Add `/claude-marketplace-status` as the main visibility surface

**Decision**: Register a status command that reports discovered plugins, enabled state, scopes, compatibility/layout status, discovered components, generated resource counts, active agent names, hook counts, and injected bin paths.

**Rationale**: This bridge touches prompts, hooks, agents, and PATH behavior. A dedicated status view is the safest way to make the runtime inspectable when something does not load as expected, especially when Claude-side layout or settings drift causes partial compatibility.

**Alternatives considered**:
- **Debug logs only**: rejected because users need an interactive, deterministic inspection path.
- **No visibility tooling**: rejected because silent discovery and PATH issues would be too opaque.

## Risks / Trade-offs

- **[Third-party plugin security surface]** → Keep support opt-in through existing Claude enablement, show active plugins clearly in status output, and document that hooks/agents/bin execute trusted third-party code.
- **[Claude plugin format drift]** → Validate against the supported v1 layout, record compatibility failures in status output, and skip unsupported plugins rather than partially activating them.
- **[Command/skill wrapper staleness]** → Rebuild generated resources on `resources_discover` for both startup and reload, and delete stale wrappers before publishing fresh ones.
- **[Agent semantic mismatch with Claude]** → Keep v1 foreground-only, document unsupported fields, and validate frontmatter strictly enough to fail clearly.
- **[Partial hook parity]** → Limit v1 to command hooks, map only selected events, and surface unsupported hook types as warnings rather than silent failures.
- **[Runtime complexity across many subsystems]** → Centralize discovery in the registry and keep module boundaries tight so each subsystem consumes the same normalized model.
- **[Package size creep inside SuPi]** → Keep `claude-marketplace/` modular and extraction-friendly so it can move to its own pi package later if maintenance cost grows.
- **[Cross-platform cache/path behavior]** → Use Node built-ins for path handling and keep generated artifacts in a dedicated cache directory, not inside the git-tracked repo.

## Migration Plan

1. Add the new extension directory and register it in `package.json` without changing existing extensions.
2. Ship the bridge disabled unless a compatible Claude plugin is actually discovered and enabled for the current cwd.
3. Update documentation with namespace rules, scope behavior, security notes, and the status command.
4. If rollback is needed, remove the extension entry from `package.json` and publish a patch release; no persistent repo data migration is required.

## Open Questions

- Should v1 add helper slash commands for plugin agents after the `claude_plugin_agent` tool is stable?
- Is a small vendored hook adapter sufficient, or does later real-world usage justify depending on `pi-hooks` directly?
- Should wrapper generation preserve plugin-authored descriptions verbatim, or append explicit provenance text to every wrapper for safety and clarity?
- At what complexity threshold should `claude-marketplace/` be extracted into its own standalone pi package?
