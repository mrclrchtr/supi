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

**DevTools**:
A package-catalog tag for SuPi features aimed primarily at debugging, inspecting, or developing SuPi/PI extension behavior rather than ordinary coding workflow.
_Avoid_: developer tools
