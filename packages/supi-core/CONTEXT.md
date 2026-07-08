# supi-core

Shared infrastructure for SuPi extensions: XML context tags, config system, settings registry, debug registry, and instruction-file surfacing. Library-only — no PI extension surface, no `./extension` export.

See also: root `CONTEXT.md` for project-wide terms (Extension Package, Infrastructure Package, Capability Family, etc.).

## Language

**Configuration Section ID**:
The stable namespace for one SuPi package's shared configuration values.
_Avoid_: config category, settings group

**Settings Contribution**:
A SuPi extension's runtime-declared, config-backed settings section for a Configuration Surface to collect and render. A contribution describes editable SuPi config values and scoped persistence behavior; it is not itself the stored configuration.
_Avoid_: global settings singleton, arbitrary settings UI registry, assuming one shared package instance

**Declarative Settings Schema**:
A Settings Contribution shape where an extension describes configurable values and edit controls, while the shared settings module owns scope inheritance, persistence, and rendering semantics.
_Avoid_: per-package settings UI logic, raw SettingItem factory for config-backed values

**Project Override**:
A project-scoped SuPi configuration value that intentionally replaces the value inherited from broader configuration for the current workspace. It remains an override even when its value text matches a package default.
_Avoid_: project setting when the presence or absence of an override matters, local value

**Explicit Value**:
A stored value chosen in a specific configuration scope. It is semantically different from an Inherited Value even when both render to the same user-facing value.
_Avoid_: treating default-looking values as unset, conflating disabled with inherit

**Inherited Value**:
The effective value used for a configurable setting when the selected scope has no stored value of its own; it comes from the next broader applicable configuration source.
_Avoid_: unset value, blank value, override when the setting lacks a scoped stored value

**Inheritance Source**:
The broader configuration source that supplies an Inherited Value: Global configuration when a user value exists there, otherwise package defaults.
_Avoid_: parent setting, fallback source when discussing scoped settings

**Value Source State**:
A settings UI state that identifies whether the displayed value comes from the selected scope, Global configuration, or package defaults. Declarative and custom settings controls should report this state consistently.
_Avoid_: inferring source from display text, treating custom controls as source-less rows

**Inherit Action**:
A source-aware settings UI action that removes a Project Override so the setting uses its Inherited Value again; it may be labeled "Inherit from global" or "Use default" depending on the resulting Inheritance Source.
_Avoid_: reset if it may not restore a default, unset as user-facing copy

**Reset to Default Action**:
A settings UI action that removes a Global configuration value so package defaults supply the setting again.
_Avoid_: inherit when no broader user scope exists, unset as user-facing copy

**Debug Registry**:
The session-local SuPi buffer that stores diagnostic events emitted by extension packages for later inspection.
_Avoid_: log sink, event log, telemetry store

**Debug Event Producer**:
A SuPi extension package that records diagnostic events into the Debug Registry while doing its own primary work. Producers emit events only; they do not own registry reset, retention, or exposure policy.
_Avoid_: logger, debug source, registry owner

**Debug Surface**:
The SuPi extension package role that owns debug-event configuration, user/model inspection surfaces, and registry reset policy.
_Avoid_: debug producer, generic observability package

**Instruction File**:
A directory-local agent guidance file, such as `CLAUDE.md` or `AGENTS.md`, that gives maintainers and agents local working instructions for a workspace area.
_Avoid_: claude-md file, context file

**Instruction-File Surfacing**:
The mechanism by which `code_orientation` with directory focus surfaces directory-local instruction files into agent context. Surfaced files are guidance chrome, not tool evidence, and have a 200-line per-file display limit. Root instruction files are loaded by pi's system prompt, not by this mechanism.
_Avoid_: instruction-file injection, auto-context, CLAUDE.md injection
