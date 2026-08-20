# Tool package architecture convention

This document defines the preferred internal architecture for SuPi packages that register model-callable tools with PI. `package-layout.md` defines folder layout; this document defines metadata, workflow, result, runtime, and presentation seams.

## Core rule: one public-surface source

Every registered tool keeps its public surface in one place: its per-tool directory under `src/tool/` (§ Per-tool directory layout). Do not hand-maintain the same names or enum values in schemas, routers, status views, and tests.

A tool's `spec.ts` owns:

- canonical name and label
- parameter schemas
- execution bindings — `execute` lives on the spec object when it needs no runtime dependencies; when a tool's schema or execute is dynamic (depends on catalog or session state), `spec.ts` exports the factory (e.g. a parameter builder or execute factory) and `register.ts` evaluates it at registration time
- concise purpose and substrate metadata

The paired `guidance.ts` owns verbose descriptions, snippets, and guidelines. Registration imports each tool's spec and guidance; alignment tests assert that registration matches the spec modules.

## Preferred module depth

A tool-bearing package normally separates five concerns:

1. **Metadata** — names, schemas, descriptions, and guidance.
2. **Workflow** — intent policy, readiness, target resolution, and typed outcomes.
3. **Result assembly** — sections, evidence lists, totals, omission metadata, provenance, and actions.
4. **Presentation adapters** — markdown and TUI projections over assembled results.
5. **PI adapter** — `pi.registerTool`, lifecycle hooks, commands, and execution-control translation.

The PI adapter should register metadata, invoke one workflow interface, and map the result. Filesystem, parser, language-server, and evidence policy do not belong there.

A deep workflow module hides multiple decisions behind a small interface. A forwarding module that merely renames another method adds no depth and should usually be removed.

## Per-tool directory layout

Every registered tool gets its own directory under `src/tool/`, regardless of how many tools a package registers. One invariant beats per-package judgment: all code for one tool lives in one directory. The directory name matches the tool name (snake_case).

```text
src/tool/
  <tool_name>/
    spec.ts      — canonical name and label, parameter schema, execution bindings
    guidance.ts  — prompt surface and its config defaults
    execute.ts   — execution and workflow glue (role name may vary, e.g. workflow.ts)
    result.ts    — result assembly; sole producer of model-visible content and details
    render.ts    — transcript display (or a render/ subfolder)
  <shared tool modules>  — formatting, paging, or result cores used by 2+ tools
```

Rules:

- Files inside a tool directory are role-named; the directory carries the tool name.
- A tool directory holds only that tool's files. Shared modules live at `src/tool/` level; infrastructure that is not tool-specific lives in package-level domain folders (`target/`, `audit/`, git helpers, …).
- Registration (the PI adapter) imports each tool's spec and guidance and holds no tool-specific logic.
- Presentation for one tool lives in its directory (`render.ts` or `render/`); package-wide UI lives in `ui/`.
- Optional files are allowed: tiny tools may not need separate execute or render modules. `spec.ts`, `guidance.ts` (when the tool ships prompt metadata), and `result.ts` exist for every tool that returns model-visible results.

## Context channel ownership

Each PI context channel (`../pi/context-architecture.md`) maps to exactly one seam. Content placement rules live in `../pi/tool-guidance.md` § Content Budget and Placement; this section assigns code ownership.

| Channel | Billing | Owning seam |
| --- | --- | --- |
| `description`, `promptSnippet`, `promptGuidelines`, schema field descriptions | Tier 1 prefix | Metadata (spec + guidance) |
| System-prompt injection, skill catalog entries | Tier 1 prefix | PI adapter; skill files |
| Result `content`, injected message `content` | Tier 2 addition | Result assembly |
| Result `details`, `pi.appendEntry`, spill files | Free | Result assembly; session code |
| Transcript renderers, TUI components | Never sent | Presentation adapters |

Metadata rules:

- Canonical names and labels are metadata and live in the tool's `spec.ts`; the prompt surface lives in the paired `guidance.ts`.
- Do not split the prompt surface into per-field modules. `description`, `promptSnippet`, and `promptGuidelines` change together; the fields themselves are the fact homes.
- Lazy/dynamic tools ship `description` only and omit `promptSnippet`/`promptGuidelines`.
- Prompt-surface config defaults derive from the same constants; keep them beside the content to prevent drift.

Result rules:

- The result module is the sole producer of model-visible `content` and free `details`, and owns truncation and spill-file policy.
- Presentation folders (`render/`, `ui/`, markdown/TUI adapters) never produce model-visible text; result assembly never lives under a presentation folder.

## Result module naming

Name result modules after pi's vocabulary: `execute()` returns an `AgentToolResult` (`content` + `details`), and this seam is result assembly. Use `result`, not `output` — "output" is pi's truncation-limit and transcript vocabulary and would collide.

Each tool's result assembly lives in `src/tool/<tool_name>/result.ts`. Shared result cores, formatting, or paging used by two or more tools live as named modules at `src/tool/` level; infrastructure that is not tool-specific lives in package-level domain folders.

Placement rules:

- Result assembly never lives under `render/` or `ui/`, and not at the package root once `src/tool/` exists.
- Transient `onUpdate` progress text may live in workflow/execution modules; final results must be built by the tool's result module.
- Legacy names (`output.ts`, `review-result.ts`) are renamed when the package migrates to the per-tool layout.

## Typed outcomes

Workflow seams return immutable facts, not presentation strings. Keep these outcomes distinct:

- completed
- invalid input
- disambiguation
- unavailable capability
- timeout
- partial evidence

Internal defects may throw. A whole-tool capability failure should throw from the PI executor; valid searches with zero matches are successful completed outcomes.

Mutable providers, clients, managers, caches, and target records should not cross a public workflow seam.

## Result assembly

When multiple tools share result policy, centralize it. Result assembly should be the sole consumer of workflow facts and the sole source for:

- section status
- evidence and actionable lists
- candidate, shown, and omitted totals
- unknown-remainder and partial-reason metadata
- confidence and provenance
- next queries and read-next actions
- structured details

Markdown and TUI adapters consume the assembly independently. Neither adapter parses the other, collects evidence, or recomputes truncation.

## Schemas and exact-one inputs

Use structurally explicit inputs when one of several intents is valid. For model-provider compatibility, prefer closed objects with one-key cardinality over schema unions or literals.

For example, a target selector may admit one of `handle`, `anchor`, `symbol`, or `file`, with each tool allowing only the branches it can honor. Do not accept contradictory flat fields and resolve them through precedence.

Runtime validation still matters for direct tests and callers that bypass PI schema validation.

## Capability and path semantics

Runtime modules determine whether a capability exists; metadata defines its public label; presentation adapters render it. Avoid scattering strings such as `hover(file,line,char)` across runtime, guidance, status, and tests.

Normalize path and URI semantics consistently:

- leading `@` on path inputs
- workspace-relative resolution
- `file://` URI decoding
- platform-specific drive handling

Shared helpers live in `@mrclrchtr/supi-core/project` when more than one package needs the same behavior.

## Workspace runtime interfaces

A reusable runtime should expose a workspace-scoped interface, not its mutable manager or clients. Registry state should distinguish ready, pending, inactive, disabled, and unavailable.

Current examples:

- `supi-lsp` exports `WorkspaceLspRuntime`; `LspRuntimeController` owns lifecycle and status while the runtime owns semantic operations, routing, diagnostics, and recovery.
- `supi-tree-sitter` exports a session-scoped structural runtime for parser reuse.
- `supi-code-runtime` brokers canonical semantic and structural capability state.

Reuse the core session-registry helper for normalized workspace-keyed state. Keep package-specific state unions and wait policy local.

## Current code-intelligence example

`packages/supi-code-intelligence` exposes exactly eight tools:

- `code_resolve`
- `code_inspect`
- `code_orientation`
- `code_graph`
- `code_find`
- `code_health`
- `code_refactor_plan`
- `code_refactor_apply`

Its main seams are:

- `src/tool/code_*/spec.ts` and `guidance.ts` — per-tool canonical metadata and prompt surface; `specs.ts`, `guidance.ts`, and `schemas.ts` aggregate and hold the shared schema vocabulary
- `src/session/` — Workspace code-intelligence session and typed workflows
- `src/tool/code_*/result.ts` with the shared core in `src/tool/result/assembly.ts` — canonical Tool result assembly
- `src/tool/code_*/markdown.ts` and TUI modules — presentation adapters
- `src/tool/register.ts` — PI registration adapter

`code_orientation` replaced the old context/brief surfaces. `code_impact` and the older graph relation families are removed rather than aliased.

## Code-understanding package ownership

- `supi-code-intelligence` owns the model-callable `code_*` family and cross-substrate workflow policy.
- `supi-lsp` owns the semantic runtime and language-server lifecycle.
- `supi-tree-sitter` owns structural parser reuse.
- `supi-code-runtime` owns canonical capability contracts and workspace capability state.

Installing `@mrclrchtr/supi-code-intelligence` activates the public tools. The substrate packages remain library-only dependencies.

## Anti-patterns

Avoid:

- repeated public-name lists
- giant action switches with duplicated metadata
- hidden global lookup inside deep analysis code
- flat contradictory inputs with precedence
- provider or manager leakage through workflow outcomes
- markdown-first result construction
- TUI parsing markdown
- convention-derived classifications or absence claims
- forwarding-only modules and tests

## Adoption

Use this convention for new tool packages and when an existing package receives structural work. Do not add metadata machinery to a genuinely tiny one-tool package unless duplication has appeared.
