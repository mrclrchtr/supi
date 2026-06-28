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

**Orientation surface**:
The code-intelligence surface that helps an agent establish where it is, what boundaries and landmarks matter, and what source it should inspect next before choosing more surgical tools.
_Avoid_: context bundle, relation graph, treating orientation as target analysis

**Orientation focus**:
The project, package, directory, file, or symbol that an orientation surface is centered on. An absent focus means workspace-level orientation; a precise focus means symbol-centered orientation rather than relation analysis.
_Avoid_: scope, path, target when referring to orientation selection

**Honest correctness**:
The code-intelligence result standard that a tool must either report evidence-backed facts or explicitly say why it cannot. Silent guessing, silent truncation, silent scope widening, and silent fallback to a weaker substrate are incorrect even when they look helpful.
_Avoid_: best-effort correctness, "probably right", hiding degraded evidence

**Truncation disclosure**:
The honest-correctness invariant that a partial result must say it is partial. When a tool omits matching evidence because of a result cap, the user and agent must be able to distinguish "there are no more results" from "more results exist but were not shown".
_Avoid_: silent truncation, hidden caps, treating capped output as complete evidence

**Tool evidence**:
The facts in a public code-intelligence result that a user or agent may rely on to make a coding decision, such as matched targets, references, diagnostics, test files, test labels, imports, exports, callees, implementations, affected files, source-file listings, dependency facts, planned refactor edits, or exposed code-action facts. Decorative summaries, next-step hints, and UI-only chrome are not tool evidence.
_Avoid_: treating every rendered list as evidence, hiding evidence limits in presentation details

**Evidence list**:
A bounded collection of tool evidence with explicit completeness metadata: which evidence atoms are shown and whether the list is complete. Normal public-tool paths compute exact totals and omitted counts. Unknown totals are reserved for exceptional interruption or provider-limited results, such as timeout, safety-limit, interrupted enumeration, or an upstream provider that cannot expose a true total, and must carry an explicit partial reason instead of pretending exact completeness. Markdown and structured details should describe the same evidence list rather than computing truncation separately.
_Avoid_: raw capped arrays, renderer-only omission math, details-only omission math, inventing exact totals, using unknown totals as a routine performance shortcut

**Actionable list**:
A bounded list of generated executable or check actions a user or agent may run, such as verification commands. Actionable lists are not tool evidence, but they follow the same truncation-disclosure rule because omitting actions silently can mislead follow-up work. Prose navigation hints such as `nextQueries` are guidance chrome, not actionable lists.
_Avoid_: silently capped command lists, treating generated actions as evidence facts, treating all hints as actions

**Read-next guidance**:
A guidance-chrome section in public code-intelligence markdown that points a user or agent to exact source ranges worth inspecting after a summarized result. It is not tool evidence and does not replace reading the source before editing.
_Avoid_: treating read suggestions as evidence, treating read suggestions as verification commands, hiding source inspection behind summaries

**Prompt suggestion**:
A generated candidate user prompt offered after an assistant response for the user to accept, edit, ignore, or replace. It is advisory and must not be treated as submitted input until the user accepts or sends it.
_Avoid_: next prompt, auto prompt, generated prompt, prefilled prompt

**Ghost text**:
A presentation of a prompt suggestion as dim inline preview text in the editor that is not part of the editor contents until accepted.
_Avoid_: treating ghost text as editor text, autocomplete item, prefill

**Suggestion source**:
The component responsible for producing prompt suggestions. A suggestion source may be model-backed, heuristic, disabled, or test-only, and is distinct from PI model providers and autocomplete providers.
_Avoid_: suggestion provider, ghost text provider, model provider

**Scoped model set**:
The PI-configured set of models a SuPi feature may offer when it requires explicit model selection. A feature using this set should not silently widen to every available model or fall back to the current session model when it is outside the set.
_Avoid_: all models, unscoped picker, current-model fallback

**Change set**:
A user-supplied set of files or targets that should be analyzed as in scope for a proposed or current code change. It is not inferred from git and carries no line-level diff evidence.
_Avoid_: changed files, dirty files, diff input, implying git state

**Evidence atom**:
One fact that can independently support a coding decision. Evidence-list totals and omitted counts are expressed in evidence atoms, not rendered rows or grouping containers. For example, reference locations count as references even when displayed under grouped file headings, and individual diagnostic messages count as diagnostics even when grouped by file.
_Avoid_: counting visual rows as facts, treating file groups as references

**Result cap**:
A display limit for public tool evidence, not a normal-path collection limit. A capped result may show fewer evidence atoms than exist, but it must still disclose the exact total and omitted count unless exceptional interruption prevents exact counting.
_Avoid_: treating `maxResults` as permission to stop counting evidence, silent early-stop search

**Evidence ordering**:
The rule for choosing which evidence atoms are shown when a result cap applies. Domain-specific ranking is preserved when it is meaningful, such as semantic/search relevance; otherwise evidence atoms are ordered deterministically by stable facts such as file, line, or name.
_Avoid_: accidental provider order, random truncation, sorting away meaningful relevance

**Semantic analysis**:
Code understanding based on symbol identity and relationships, such as definitions, references, implementations, and renames.
_Avoid_: structural analysis, syntax-only analysis

**Structural analysis**:
Code understanding based on source shape and syntax, such as imports, exports, outlines, and call-like structure, without requiring symbol identity.
_Avoid_: semantic analysis, symbol-aware analysis

**Structural callee**:
A syntax-derived outgoing-call evidence atom from the enclosing executable scope at a target anchor. Structural callees name the call expression as written; they are not symbol-identity evidence. Calls inside nested functions, methods, or callbacks are not attributed to the outer scope.
_Avoid_: semantic callee, caller, reference, treating nested callback calls as direct parent calls

**Refactor plan**:
A stored, fingerprinted description of a proposed code refactor — its target, operation (e.g. rename or extract), and the exact text edits — produced for inspection and applied later, never silently. Non-mutating by construction.
_Avoid_: "refactor action", "code action result" (those are advisory, not stored plans)

**Plan-then-apply (planner/applier split)**:
The invariant that composing a refactor and mutating files are done by separate concerns: the proposer only composes a plan (returning a plan handle), and mutation is an explicit, revalidating second step against that handle. Producers of plans never mutate; mutators never compose.
_Avoid_: "auto-apply", "preview-and-apply in one call" (these collapse the split into one mutating step)

**Scope**:
The public parameter that narrows a code-intelligence query to one workspace-relative path — a directory or a single file. It is a selection/orientation boundary and a filter, not a search pattern and not a downstream evidence filter: an unresolved path is a hard error rather than a silent widening to the whole workspace, package-name-to-directory resolution is intentionally absent, and when a precise target (`targetId` or anchored coordinates) is supplied alongside `scope`, the precise target wins and `scope` is ignored with a visible note. Future evidence filtering should use a separate parameter, not `scope`.
_Avoid_: `path`, `searchPath`, `dir` as public parameter names, treating `scope` as a downstream evidence filter for precise targets

**Name anchor**:
The source position of a symbol's identifier token — the offset position-strict substrates (tree-sitter `calleesAt`, hover-at, rename) must resolve against. Best-effort on `CodeSymbol`: present when the provider can derive it (LSP `DocumentSymbol.selectionRange`, or a tree-sitter identifier-snap fallback), absent when neither is available. Distinct from `Declaration anchor`.
_Avoid_: "the symbol's start", "selectionRange part", conflating with declaration anchor

**Declaration anchor**:
The source position of the defining node's start, including `export`/modifier keywords — what LSP `SymbolInformation.location.range.start` gives. Always available; safe for position-tolerant queries (`references`), wrong for position-strict substrates (`callees`, `rename`). Distinct from `Name anchor`.
_Avoid_: "the symbol's start", "location start", conflating with name anchor

**Dual-surface rendering**:
The rule that a tool's TUI rendering builds its chrome (headers, badges, counts) and body (main content) from the structured `details` object, never by parsing the markdown `content` string. The markdown string serves only as the LLM-facing output and as an optional collapsible detail view in the TUI. Chrome and body are independent consumers of the same underlying tool evidence.
_Avoid_: parsing markdown in TUI renderers, using the Markdown component as the primary TUI body, duplicating evidence between content and details

**TUI chrome**:
The non-body decorative and status elements of a dual-surface tool result: the compact call line in `renderCall`, and in `renderResult` the header badges, count summaries, evidence disclosures, and section toggles. Chrome is built from `details` data, never from markdown parsing.
_Avoid_: building chrome from markdown, embedding chrome in the markdown content string

**TUI body**:
The main content of a dual-surface tool result in `renderResult`: per-section structured widgets built from `details` data. The markdown `content` string is available as an optional collapsible detail view within the body, not as the primary body itself.
_Avoid_: using the Markdown component as the primary body, treating the markdown string as the user-facing result
