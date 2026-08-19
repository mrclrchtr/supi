# SuPi

SuPi is a curated toolkit of extensions for the PI coding agent. It exists to make PI more capable in day-to-day coding sessions while keeping agent-facing context intentional and small.

This repo is a multi-context monorepo. See `CONTEXT-MAP.md` for per-package contexts. This file defines project-wide, cross-cutting domain terms. Package-specific terms live in each package's `CONTEXT.md`.

## Language

**SuPi**:
A curated PI extension toolkit for day-to-day coding sessions, spanning code understanding, external knowledge lookup, context and cache observability, structured human handoff, review and reporting workflows, diagnostics, configuration, and workflow quality. It can be installed as a full stack or as individual packages.
_Avoid_: token-saving layer, generic plugin collection

**Context Efficiency**:
A SuPi design principle: extensions should be developed with the initial context window size always in mind. Prefer concise tool descriptions, focused guidelines, and package-level installation choices so useful capability does not automatically mean a larger starting prompt.
_Avoid_: token saving, prompt minimalism

**Prompt Surface Compression**:
A Context Efficiency practice that reduces a tool's model-facing prompt surface while preserving its callable behavior and honest usage contract.
_Avoid_: dumbing down tools, removing capability, token shaving

**Prompt Surface**:
The model-facing text a tool contributes to the system prompt: its description, prompt snippet, and prompt guidelines. It excludes the tool schema, which travels in the tools parameter.
_Avoid_: prompt, prompt text

**Prompt Template**:
A Markdown prompt shipped by a SuPi package via `resources_discover` promptPaths, or placed project-locally in `.pi/prompts/`, and invoked as `/name` in the editor. It is distinct from a tool's Prompt Surface.
_Avoid_: prompt, prompt surface

**Capability Family**:
A README grouping that explains SuPi packages by the user problem they solve rather than by package internals or install order. Each family should point readers to the relevant package README files for full details.
_Avoid_: package category, module group

**Recommended Release Stack**:
The curated set of stable Extension Packages installed for ordinary use. It is smaller than the Full Stack and does not define which packages the repository loads during development.
_Avoid_: standard root, release surface, default workspace

**Full Stack**:
The opt-in installation of all user-facing SuPi Extension Packages, including beta and DevTool Packages.
_Avoid_: Recommended Release Stack, workspace install

**Workspace Extension Surface**:
The complete set of Extension Packages loaded from the repository root for development and local or Git installs. It represents the Full Stack, not the Recommended Release Stack.
_Avoid_: root stack, standard stack, release stack

**Extension Package**:
A SuPi package that can be installed into PI and registers extension behavior such as tools, commands, event handlers, settings, or UI.
_Avoid_: plugin package, module

**Infrastructure Package**:
A SuPi package that supports other packages but is not promoted as a directly installed PI extension. Infrastructure packages should still be linked from the root README, but separately from user-facing extension packages.
_Avoid_: internal package, hidden package

**Configuration Surface**:
A user-facing SuPi package whose main role is to make other SuPi packages easier to configure and inspect. It should be described as a control surface rather than as a standalone capability family.
_Avoid_: meta package

**Package Badge**:
A compact `<kbd>` label in the root README package catalog that communicates audience, maturity, or role without adding long prose.
_Avoid_: tag, status label

**Package Card**:
A root README catalog entry that promotes one SuPi package with its README link, install command, compact badges, and a short value statement. Package cards should not duplicate each package README.
_Avoid_: package table row

**Agent-Facing**:
A package-catalog badge for SuPi behavior the PI agent can use directly, such as model-callable tools, injected agent context, or tool-call hooks. The public README badge should be written as `Agent`.
_Avoid_: agent-usable, passive

**Human-Facing**:
A package-catalog badge for SuPi behavior the user drives directly, such as slash commands, TUI overlays, reports, shortcuts, or configuration screens. The public README badge should be written as `Human`.
_Avoid_: human-only

**DevTool**:
A package-catalog badge for SuPi features aimed primarily at debugging, inspecting, or developing SuPi/PI extension behavior rather than ordinary coding workflow.
_Avoid_: DevTools, developer tools

**DevTool Package**:
A released Extension Package that is not part of the recommended stack. It is aimed at debugging, inspecting, or developing SuPi/PI extension behavior rather than ordinary coding workflow, and users opt in to it instead of receiving it by default.
_Avoid_: beta package, Infrastructure Package, release stack package

**Quality-of-Life**:
Small PI session improvements that reduce friction without becoming the central reason to install SuPi, such as aliases, prompt stashing, activity indicators, and default bash timeouts.
_Avoid_: workflow guardrails, workflow quality-of-life

**Context Usage Monitor**:
A display or report that shows how the current PI session is spending its context window.
_Avoid_: context usage

**Prompt Surface Override**:
A user or project configuration of a tool's model-facing prompt surface — description, prompt snippet, and prompt guidelines — while preserving the tool's runtime behavior and schema.
_Avoid_: tool behavior override, UI customization

**Trust-Gated Prompt Surface Override**:
A project-scoped Prompt Surface Override that SuPi honors only when PI project trust is active and the project has a PI-recognized trust-gated resource such as `.pi/settings.json`. Global prompt-surface overrides are user-scoped and do not require project trust.
_Avoid_: treating project prompt text as trusted by location alone, runtime behavior override

**Load Status Marker**:
A versioned SuPi diagnostic marker emitted for external harnesses as an observed inventory of loaded SuPi tools and commands. It is not a Debug Event, is not governed by Debug Registry settings, and does not decide whether a particular harness's expected resources are present.
_Avoid_: debug event, registry event, telemetry, policy checker
