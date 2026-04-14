## Why

SuPi explicitly aims to improve marketplace compatibility, but today pi cannot directly discover or run Claude marketplace plugins inside this package. That means Claude plugin users must manually copy commands, skills, and agent behavior into pi, and they lose hooks and `bin/` integration entirely. Building a compatibility layer as a normal pi package validates the extension-first path now, before considering a fork of pi core.

## What Changes

- Add a new `claude-marketplace/` extension stack that discovers Claude plugins, parses manifests, validates the supported Claude plugin layout, and resolves effective enablement for the current working directory
- Generate namespaced wrappers for enabled plugin commands and v1 skill support so Claude plugin resources can be invoked safely inside pi without collisions while preserving progressive-disclosure guidance
- Add a plugin agent registry and foreground execution bridge built on pi's subagent pattern
- Load plugin `hooks/hooks.json` command hooks and adapt supported Claude hook events onto pi lifecycle and tool events
- Prepend enabled plugin `bin/` directories to the bash execution environment for both agent and user shell commands
- Add visibility tooling so users can inspect enabled plugins, discovered components, and active path injections
- Explicitly defer `.lsp.json` bridging, MCP parity, plugin installation UX, and any pi core fork from v1

## Capabilities

### New Capabilities
- `claude-plugin-registry`: Discover Claude plugins across scopes, resolve enablement for the current cwd, and expose normalized plugin/component metadata
- `claude-plugin-resources`: Surface namespaced wrappers for enabled plugin commands and skills through pi resource discovery
- `claude-plugin-agents`: Discover plugin-provided agents and execute them through an isolated pi subagent runtime
- `claude-plugin-hooks`: Load supported Claude command hooks and adapt them onto pi events with safe failure handling
- `claude-plugin-bin-path`: Inject enabled plugin `bin/` directories into bash environments with deterministic ordering and visibility
- `claude-plugin-status`: Expose an inspectable status surface for discovery, compatibility, wrapper generation, hooks, agents, and PATH injection state

### Modified Capabilities
<!-- No existing OpenSpec capabilities need requirement changes for this work -->

## Impact

- **New files**: `claude-marketplace/` directory with extension entry point, registry, resource generation, agent runtime, hook runner, bin-path integration, status helpers, compatibility checks, and shared types
- **package.json**: Add the new extension entry to `pi.extensions` and include the new directory in published package files
- **Runtime behavior**: New `resources_discover`, `input`, `tool_call`, `user_bash`, `session_start`, and `session_shutdown` integrations
- **Docs**: Update `README.md` and `CLAUDE.md` with marketplace support behavior, scope rules, security notes, and namespace conventions
- **Security surface**: This change intentionally enables third-party plugin prompts, hooks, agents, and executables inside pi, so defaults and status output must stay conservative and transparent
