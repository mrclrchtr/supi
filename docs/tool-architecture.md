# Tool package architecture convention

This document defines the preferred internal architecture for SuPi packages that register model-callable tools with PI. `docs/package-layout.md` defines folder layout; this document defines metadata, workflow, result, runtime, and presentation seams.

## Goals

- keep public tool interfaces coherent
- make capabilities typed before they become display strings
- centralize workflow and result policy for leverage
- keep runtime ownership local to the package that understands it
- make PI registration a thin adapter

## Core rule: one public-surface source

A package with non-trivial tool metadata keeps one canonical tool list under `src/tool/`. Do not hand-maintain the same names or enum values in guidance, schemas, routers, status views, and tests.

For a family of public tools, a spec module should own:

- public names
- parameter schemas
- execution bindings
- concise purpose and substrate metadata

A paired guidance module may own verbose descriptions, snippets, and guidelines, but it must be keyed by the canonical names and covered by alignment tests.

## Preferred module depth

A tool-bearing package normally separates five concerns:

1. **Metadata** — names, schemas, descriptions, and guidance.
2. **Workflow** — intent policy, readiness, target resolution, and typed outcomes.
3. **Result assembly** — sections, evidence lists, totals, omission metadata, provenance, and actions.
4. **Presentation adapters** — markdown and TUI projections over assembled results.
5. **PI adapter** — `pi.registerTool`, lifecycle hooks, commands, and execution-control translation.

The PI adapter should register metadata, invoke one workflow interface, and map the result. Filesystem, parser, language-server, and evidence policy do not belong there.

A deep workflow module hides multiple decisions behind a small interface. A forwarding module that merely renames another method adds no depth and should usually be removed.

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

- `src/tool/specs.ts` and `src/tool/guidance.ts` — canonical public metadata
- `src/session/` — Workspace code-intelligence session and typed workflows
- `src/tool/result/assembly.ts` — canonical Tool result assembly
- `src/tool/*/markdown.ts` and TUI modules — presentation adapters
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
