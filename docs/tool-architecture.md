# Tool package architecture convention

This document defines the preferred internal architecture for SuPi packages that
register model-callable tools with pi.

It complements `docs/package-layout.md`:
- `package-layout.md` defines folder-level conventions
- this document defines how tool metadata, execution, and runtime services
  should be organized inside those folders

## Goals

- keep public tool surfaces internally coherent
- avoid duplication between schemas, guidance, registration, and UI
- make capabilities machine-readable before they become display strings
- separate runtime services from pi-specific extension wiring
- make packages easier to evolve without silent drift

## Core rule

When a package has non-trivial public tool metadata, keep a **single source of
truth** for that metadata under `src/tool/`.

Do not hand-maintain the same tool or action list in multiple files such as:
- guidance modules
- TypeBox or `StringEnum` declarations
- action routers
- capability display helpers
- validation error text

## Preferred layering

A tool-bearing package should normally separate these concerns:

1. **Tool metadata**
   - public names
   - descriptions
   - `promptSnippet`
   - base `promptGuidelines`
   - parameter schemas or enum values
   - capability labels shown to users
2. **Execution logic**
   - action handlers
   - service-backed execution helpers
   - formatting of tool results
3. **Runtime or service layer**
   - session-scoped registries
   - parsers, clients, caches, project scans
   - reusable `/api` surfaces for peer packages
4. **Pi adapter layer**
   - `pi.registerTool(...)`
   - event hooks
   - commands, renderers, and UI wiring

Keep the pi adapter thin. It should mostly register tools from metadata and wire
up existing execution or service modules.

## Metadata module patterns

### One multiplexed tool: `src/tool/action-specs.ts`

Use this when one public tool exposes multiple actions through an `action`
parameter.

Typical historical examples:
- the old `tree_sitter` mega-tool before the focused `tree_sitter_*` split

The spec module should own the ordered public action list and any action-level
metadata needed by guidance or validation.

Example responsibilities:
- action names
- per-action prompt guidance bullets
- validation requirements such as `requiresPosition` or `requiresQuery`
- formatted action lists for error messages and docs

## Multiple public tools: `src/tool/tool-specs.ts`

Use this when one package exposes several public tools.

Typical example:
- `supi-lsp`

The spec module should own the public metadata for each tool and, when needed,
shared capability labels used by status views or prompt builders.

Example responsibilities:
- tool names and labels
- descriptions
- `promptSnippet`
- base `promptGuidelines`
- parameter schemas
- service-action bindings used by registration
- displayed capability labels derived from runtime support

## What should derive from specs

Once a package has a metadata module, these parts should derive from it instead
of re-declaring literals:

- `StringEnum([...])` values
- TypeBox schema fragments that only encode the public action or tool list
- `promptSnippet`
- `promptGuidelines`
- registration loops in `register-tools.ts` or extension entrypoints
- ordered supported-action text in validation messages
- capability labels shown in status UIs or dynamic prompt coverage

The goal is not abstraction for its own sake. The goal is to make the public
surface change in one place.

## What should stay out of specs

Do not move all logic into metadata files.

Keep these in dedicated modules:
- heavy execution logic
- filesystem or network access
- LSP clients, Tree-sitter runtimes, caches, registries
- tool-result formatting beyond small display labels
- package-specific UI behavior

Specs define the public surface. They should not become a dumping ground.

## Capability metadata

Prefer typed capability metadata before turning it into strings.

Good pattern:
- runtime layer determines whether a capability exists
- metadata layer defines how that capability is labeled publicly
- UI or guidance layer renders the labels

Avoid scattering hand-written strings such as `hover(file,line,char)` across:
- capability collectors
- prompt guidance builders
- status overlays
- tests

## Path and input semantics

Keep path and URI semantics consistent across packages.

At minimum, shared helpers should normalize:
- leading `@` on path inputs
- relative-to-`cwd` resolution
- `file://` URI decoding
- platform differences such as Windows drive prefixes

If multiple packages need the same path semantics, prefer one shared helper over
package-local copies.

Current preferred shared helpers live in `@mrclrchtr/supi-core/api`:
- `resolveToolPath(cwd, target)`
- `fileToUri(filePath)`
- `uriToFile(uri)`

## Session-scoped services

If a package provides reusable runtime functionality for peer packages, prefer a
session-scoped service API over ad hoc internal imports.

Examples:
- `supi-lsp` exposes a session registry and stable `SessionLspService`
- `supi-tree-sitter` exposes `getSessionTreeSitterService(cwd)` for shared
  structural reuse and `createTreeSitterSession(cwd)` for owned lifecycles

When multiple packages need session-scoped state keyed by workspace, reuse the
shared core session-registry helper instead of re-implementing normalized `cwd`,
`globalThis`, and `Symbol.for(...)` storage in each package. Keep package-
specific state unions, wait helpers, and fallback semantics local; share only the
storage infrastructure.

The public `/api` surface should expose stable wrappers, not internal manager or
runtime details.

## Current repo examples

### `packages/supi-tree-sitter`

This package is now **library-only**. It provides the shared session-scoped
structural service via `getSessionTreeSitterService(cwd)` so peer packages can
reuse parsers instead of creating a fresh owned session for every operation.

If substrate metadata modules such as `src/tool/tool-specs.ts` remain in the
package, treat them as **internal substrate plumbing**, not a public model-facing
surface. Public `tree_sitter_*` tools are no longer registered.

### `packages/supi-code-intelligence`

Uses `src/tool/tool-specs.ts` as the single source of truth for:
- public focused-tool names (`code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_impact`, `code_find`, `code_health`, `code_refactor_plan`, `code_refactor_apply`)
- descriptions, snippets, and base guidance
- parameter schemas for each public tool

`code_orientation` replaced the old `code_context`/`code_brief` orientation surface. `code_affected` remains an internal compatibility surface in the shared execution path, but it is no longer registered as a public tool.

`src/tool/guidance.ts`, `src/tool/register-tools.ts`, and
`src/code-intelligence.ts` derive from those specs.

### `packages/supi-lsp`

This package is now **library-only**. It provides the shared semantic runtime,
service, and provider APIs consumed by `supi-code-intelligence`.

If substrate metadata modules such as `src/tool/tool-specs.ts` remain in the
package, treat them as **internal substrate plumbing**, not a public model-facing
surface. Public `lsp_*` tools are no longer registered.

## Package ownership and cross-family orchestration

In the SuPi code-understanding stack, tool ownership follows a clear rule:

- **`supi-code-intelligence`** is the **sole pi extension exposer** for the code-understanding stack. It owns
  the public `code_*` tool surface, the substrate wiring (LSP session lifecycle, diagnostics, recovery,
  settings, and tool overrides), and the cross-family orchestration guidance above the semantic and
  structural libraries.
- **`supi-lsp`** is a **library-only** package — no pi extension surface. It provides the semantic runtime/
  service/provider APIs that power the semantic parts of the public `code_*` tools.
- **`supi-tree-sitter`** is a **library-only** package — no pi extension surface. It provides the structured
  runtime/service APIs that power the structural parts of the public `code_*` tools.

Installing `@mrclrchtr/supi-code-intelligence` activates only the public `code_*` tools. The substrate
packages are transitive dependencies, not standalone pi installations.

## Anti-patterns

Avoid these when doing structural work:

- repeating the same ordered action list in multiple files
- updating guidance text without updating schemas or validation strings
- encoding capability labels as ad hoc strings in runtime modules
- making extension entrypoints own business logic that belongs in services or
  action handlers
- hiding the public tool surface inside giant switch statements with duplicated
  metadata around them

## Adoption guidance

Use this convention for:
- new packages that register model-callable tools
- existing packages when they receive structural work
- packages where guidance, schemas, and routing are starting to drift apart

Do not force a spec module into a tiny package unless duplication has appeared.
A simple inline tool definition is still fine when the public surface is truly
small.
