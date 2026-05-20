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
- `tool/` — tool wiring, action dispatch, overrides, prompt guidance
- `ui/` — renderers, widgets, display formatting
- `session/` — per-session state, registries, persistence, runtime wiring
- domain folders such as `actions/`, `client/`, `manager/`, `forensics/`, `monitor/`, `report/`

### Prefer domain folders over generic buckets

Prefer domain folders over `core/`, `shared/`, `misc/`, or other catch-all names. Use domain folders when files already share a prefix or responsibility boundary.

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
| `supi-code-intelligence` | hybrid: root surfaces + `actions/`; optional `tool/` later |
| `supi-context` | stay flat unless it grows |
| `supi-core` | domain-first if reorganized: `config/`, `context/`, `settings/` |
| `supi-debug` | stay flat unless it grows; optional `ui/` if renderer concerns expand |
| `supi-extras` | mostly flat; split only if coherent domains emerge |
| `supi-insights` | flat source is fine; move tests to package-level `__tests__/unit/` |
| `supi-lsp` | hybrid large-package layout with `config/`, `client/`, `manager/`, `diagnostics/`, `tool/`, `ui/`, `session/` |
| `supi-review` | likely hybrid with `ui/` and `tool/` if reorganized |
| `supi-rtk` | stay flat unless it grows |
| `supi-test-utils` | stay flat utility package |
| `supi-tree-sitter` | hybrid: root surfaces + possible `tool/` / `session/` |
| `supi-web` | stay flat unless it grows |

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
- `supi-web`
