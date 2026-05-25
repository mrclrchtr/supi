# Package layout convention

This document defines the default directory structure for `packages/*` in the SuPi workspace.

## Goals

- standardize package boundaries so packages are easy to scan
- keep small packages simple
- use domain folders instead of catch-all folders
- make test layout predictable across packages

## Standard package boundary

Use these files when the package role requires them:

```text
packages/<pkg>/
  package.json
  README.md
  CLAUDE.md
  tsconfig.json
  src/
    api.ts
    index.ts
    extension.ts
    <main>.ts
  __tests__/
    tsconfig.json
    helpers/
    fixtures/
    unit/
    integration/
```

Notes:
- `src/api.ts` exists when the package exposes a reusable `/api` surface.
- `src/index.ts` is the package-root re-export surface.
- `src/extension.ts` exists when the package installs into pi.
- `<main>.ts` is the package centerpiece, usually named after the package or primary tool.
- `__tests__/unit` and `__tests__/integration` are the default test buckets once a package has more than a trivial number of tests.

## Source layout rules

### Keep packages flat until they earn structure

Stay flat when a package is small or has only one clear subsystem.

### Add optional folders only when they clearly fit

Preferred optional folders:
- `config/` — config loading, schemas, defaults, capabilities
- `tool/` — tool wiring, action specs, capability metadata, overrides, prompt guidance
- `ui/` — renderers, widgets, display formatting
- `session/` — per-session state, registries, persistence, runtime wiring
- domain folders such as `actions/`, `client/`, `manager/`, `forensics/`, `monitor/`, `report/`

### Tool guidance convention

When a package registers model-callable tools with pi, keep model-facing tool guidance under `src/tool/`.

Preferred pattern:
- single custom tool → `src/tool/guidance.ts`
- multiple custom tools → one guidance file per logical tool, such as `src/tool/<tool-name>-guidance.ts`
- built-in tool overrides may export only the extra `promptGuidelines` they add on top of pi-owned metadata
- packages with no registered tools should not add empty guidance modules

Guidance modules should export the relevant prompt surfaces for that tool:
- `toolDescription`
- `promptSnippet`
- `promptGuidelines`
- optional dynamic builders such as `buildPromptGuidelines()` when the guidance depends on runtime or project state

### Tool metadata convention

When a package has more than trivial tool metadata, keep a single source of truth for the public tool or action surface under `src/tool/`.

Preferred pattern:
- one multiplexed tool with an `action` parameter → `src/tool/action-specs.ts`
- multiple public tools in one package → `src/tool/tool-specs.ts`
- small packages with one simple tool may keep metadata inline until duplication appears

These spec modules should own the public metadata that otherwise drifts between guidance, schemas, registration, and UI:
- tool or action names
- parameter schemas or enum values
- descriptions, `promptSnippet`, and base `promptGuidelines`
- validation support text such as ordered action lists
- displayed capability labels when the package surfaces runtime support to users

Guidance and registration code should derive from those specs rather than re-declaring the same literals in multiple files. Keep execution logic in separate action or service modules. For the full rationale and examples, see `docs/tool-architecture.md`.

### Prefer domain folders over generic buckets

Prefer domain folders over `core/`, `shared/`, `misc/`, or other catch-all names. Use domain folders when files already share a prefix or responsibility boundary.

### Shared helpers belong in `supi-core`

When multiple SuPi packages need the same path, URI, config, or session helper semantics, prefer a shared helper in `@mrclrchtr/supi-core/api` over package-local copies. This is especially important for:
- leading `@` path normalization
- relative-to-`cwd` resolution
- `file://` URI conversion

## Test layout rules

- tests belong at package level, not under `src/`
- use `__tests__/helpers/` for shared test utilities such as `integration-utils.ts`
- use `__tests__/fixtures/` for sample data and test projects
- use `__tests__/unit/` for focused fast tests
- use `__tests__/integration/` for integration and end-to-end coverage
- package test tsconfig should include `"**/*.ts"` plus `"../src/**/*.ts"`

## Package-by-package target matrix

| Package | Target shape |
| --- | --- |
| `supi` | keep flat meta-package surface (`src/api.ts`, `src/extension.ts`) |
| `supi-ask-user` | hybrid: root surfaces + `render/` + `ui/` |
| `supi-bash-timeout` | stay flat unless it grows |
| `supi-cache` | domain-first: `forensics/`, `monitor/`, `report/`; optional `config/` later |
| `supi-claude-md` | mostly flat; optional `config/` or `session/` if runtime state grows |
| `supi-code-intelligence` | hybrid: root surfaces + `tool/` + `presentation/` + `use-case/` + `workspace/` |
| `supi-code-runtime` | library-only: flat source with `capability/` + `workspace/`; no pi extension |
| `supi-context` | stay flat unless it grows |
| `supi-core` | domain-first if reorganized: `config/`, `context/`, `settings/` |
| `supi-debug` | stay flat unless it grows; optional `ui/` if renderer concerns expand |
| `supi-extras` | mostly flat; split only if coherent domains emerge |
| `supi-insights` | flat source is fine; move tests to package-level `__tests__/unit/` |
| `supi-lsp` | hybrid large-package layout with `config/`, `client/`, `manager/`, `diagnostics/`, `tool/`, `ui/`, `session/` |
| `supi-review` | likely hybrid with `ui/` and `tool/` if reorganized |
| `supi-rtk` | stay flat unless it grows |
| `supi-test-utils` | stay flat utility package |
| `supi-tree-sitter` | hybrid: root surfaces + `tool/` + `session/` |
| `supi-web` | mostly flat; use `tool/` for per-tool guidance files when multiple tools are present |

## Package-specific examples

### `supi-insights`

Move tests out of `src/__tests__/` into package-level `__tests__/unit/`.

### `supi-lsp`

Use the hybrid structure below without forcing every file into a folder:

```text
src/
  api.ts
  index.ts
  extension.ts
  lsp.ts
  config/
  client/
  manager/
  diagnostics/
  tool/
  ui/
  session/
```

Keep ambiguous utilities at the root until they clearly belong somewhere.

## Adoption status

This convention is now the default for new packages and for existing packages when they receive structural work.

Stay flat unless they grow:
- `supi`
- `supi-bash-timeout`
- `supi-context`
- `supi-debug`
- `supi-rtk`
- `supi-test-utils`

Lightweight packages that may stay mostly flat while still using a focused `tool/` folder for guidance or tool-specific wiring:
- `supi-web`
