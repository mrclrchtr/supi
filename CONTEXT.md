# SuPi

SuPi is a curated toolkit of extensions for the PI coding agent. It exists to make PI more capable in day-to-day coding sessions while keeping agent-facing context intentional and small.

## Language

**SuPi**:
A curated PI extension toolkit for day-to-day coding sessions, spanning code understanding, external knowledge lookup, context and cache observability, structured human handoff, review and reporting workflows, diagnostics, configuration, and workflow quality. It can be installed as a full stack or as individual packages.
_Avoid_: token-saving layer, generic plugin collection

**Context Efficiency**:
A SuPi design principle: extensions should be developed with the initial context window size always in mind. Prefer concise tool descriptions, focused guidelines, and package-level installation choices so useful capability does not automatically mean a larger starting prompt.
_Avoid_: token saving, prompt minimalism

**Capability Family**:
A README grouping that explains SuPi packages by the user problem they solve rather than by package internals or install order. Each family should point readers to the relevant package README files for full details.
_Avoid_: package category, module group

**Extension Package**:
A SuPi package that can be installed into PI and registers extension behavior such as tools, commands, event handlers, settings, or UI.
_Avoid_: plugin package, module

**Infrastructure Package**:
A SuPi package that supports other packages but is not promoted as a directly installed PI extension. Infrastructure packages should still be linked from the root README, but separately from user-facing extension packages.
_Avoid_: internal package, hidden package

**Configuration Surface**:
A user-facing SuPi package whose main role is to make other SuPi packages easier to configure and inspect. It should be described as a control surface rather than as a standalone capability family.
_Avoid_: meta package

**Structured Decision**:
A fixed-form agent-user interaction used when the agent needs a focused choice or short answer before it can continue. It should be described concretely rather than as a vague handoff.
_Avoid_: clearer handoff

**Session-Aware Review**:
A guided review workflow over a selected git snapshot that uses the active session context to synthesize a review brief, runs managed reviewer agents with snapshot-scoped tools, previews the review plan, and returns structured findings with follow-up actions.
_Avoid_: code review, review automation, sub-agent review

**Quality-of-Life**:
Small PI session improvements that reduce friction without becoming the central reason to install SuPi, such as aliases, prompt stashing, activity indicators, and default bash timeouts.
_Avoid_: workflow guardrails, workflow quality-of-life

**Context Usage Monitor**:
A display or report that shows how the current PI session is spending its context window.
_Avoid_: context usage

**DevTool**:
A package-catalog badge for SuPi features aimed primarily at debugging, inspecting, or developing SuPi/PI extension behavior rather than ordinary coding workflow.
_Avoid_: DevTools, developer tools

**Agent-Facing**:
A package-catalog badge for SuPi behavior the PI agent can use directly, such as model-callable tools, injected agent context, or tool-call hooks. The public README badge should be written as `Agent`.
_Avoid_: agent-usable, passive

**Human-Facing**:
A package-catalog badge for SuPi behavior the user drives directly, such as slash commands, TUI overlays, reports, shortcuts, or configuration screens. The public README badge should be written as `Human`.
_Avoid_: human-only

**Package Badge**:
A compact `<kbd>` label in the root README package catalog that communicates audience, maturity, or role without adding long prose.
_Avoid_: tag, status label

**Package Card**:
A root README catalog entry that promotes one SuPi package with its README link, install command, compact badges, and a short value statement. Package cards should not duplicate each package README.
_Avoid_: package table row

**Code intelligence**:
The set of agent-facing capabilities that help understand, navigate, search, and refactor code.
_Avoid_: code intel, IDE features

**Semantic analysis**:
Code understanding based on symbol identity and relationships, such as definitions, references, implementations, and renames.
_Avoid_: structural analysis, syntax-only analysis

**Structural analysis**:
Code understanding based on source shape and syntax, such as imports, exports, outlines, and call-like structure, without requiring symbol identity.
_Avoid_: semantic analysis, symbol-aware analysis

**Refactor plan**:
A stored, fingerprinted description of a proposed code refactor — its target, operation (e.g. rename or extract), and the exact text edits — produced for inspection and applied later, never silently. Non-mutating by construction.
_Avoid_: "refactor action", "code action result" (those are advisory, not stored plans)

**Plan-then-apply (planner/applier split)**:
The invariant that composing a refactor and mutating files are done by separate concerns: the proposer only composes a plan (returning a plan handle), and mutation is an explicit, revalidating second step against that handle. Producers of plans never mutate; mutators never compose.
_Avoid_: "auto-apply", "preview-and-apply in one call" (these collapse the split into one mutating step)

**Scope**:
The public parameter that narrows a code-intelligence query to one workspace-relative path — a directory or a single file. It is a filter, not a search pattern; an unresolved path is a hard error rather than a silent widening to the whole workspace, and package-name-to-directory resolution is intentionally absent.
_Avoid_: `path`, `searchPath`, `dir` as public parameter names
