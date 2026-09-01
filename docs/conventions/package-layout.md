# Package layout convention

This document defines the default directory structure for `packages/*` in the SuPi workspace.

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
- `src/api.ts` exists **only** when the package exposes a reusable `/api` surface — omit it for packages with no library API.
  When present, it must re-export actual API symbols (types, utilities), never the extension factory function.
- `src/index.ts` exists when a package exports a package-root (`.`) surface or uses the file as its package centerpiece. Omit pass-through indexes that only duplicate `api.ts` or `extension.ts`.
- `src/extension.ts` exists when the package installs into pi.
- `<main>.ts` is the package centerpiece, usually named after the package or primary tool.
- `__tests__/unit` and `__tests__/integration` are the default test buckets once a package has more than a trivial number of tests.

## Source layout rules

### Keep packages flat until they earn structure

Stay flat when a package is small or has only one clear subsystem.

### Add optional folders only when they clearly fit

Preferred optional folders:
- `config/` — config loading, schemas, defaults, capabilities
- `tool/` — one directory per registered tool (spec, guidance, execution, result, display) plus shared tool modules
- `ui/` — renderers, widgets, display formatting
- `session/` — per-session state, registries, persistence, runtime wiring
- domain folders such as `actions/`, `client/`, `manager/`, `forensics/`, `monitor/`, `report/`

### Tool guidance convention

Model-facing tool guidance lives in the tool's own directory:

- every registered tool → `src/tool/<tool_name>/guidance.ts`
- built-in tool overrides may export only the extra `promptGuidelines` they add on top of pi-owned metadata
- packages with no registered tools should not add guidance modules

Guidance modules export the tool's prompt surface:
- `toolDescription`
- `promptSnippet`
- `promptGuidelines`
- optional dynamic builders such as `buildPromptGuidelines()` when the guidance depends on runtime or project state
- prompt-surface config defaults derived from the same constants

### Tool metadata convention

Each registered tool owns its machine-readable public metadata in `src/tool/<tool_name>/spec.ts`. Registration and tests derive from these modules; do not re-declare independent tool lists elsewhere. Keep execution logic in separate execute or workflow modules.

A spec module owns:
- canonical tool name and label
- parameter schemas or enum values
- execution bindings
- validation support text such as ordered action lists
- displayed capability labels when the package surfaces runtime support to users

For the full rationale and examples, see `tool-architecture.md`.

### Tool result convention

Model-visible result assembly (`content` + `details`) lives in the tool's own directory:

- every registered tool → `src/tool/<tool_name>/result.ts`
- shared result cores, formatting, or paging used by 2+ tools → named modules at `src/tool/` level
- transient `onUpdate` progress text may stay in workflow/execution modules; final results are built by the tool's result module

Never place result assembly under `render/` or `ui/`. Module names follow pi's `AgentToolResult` vocabulary (`result`, not `output`). See `tool-architecture.md` § Result module naming.

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
| `supi-ask-user` | per-tool `tool/ask_user/`; interactive form stays in `ui/` |
| `supi-bash-timeout` | stay flat unless it grows |
| `supi-cache` | domain-first: `forensics/`, `monitor/`, `report/` + per-tool `tool/cache_forensics/` |
| `supi-claude-md` | skills-only behavior with thin `resources_discover` extension; keep flat |
| `supi-code-intelligence` | per-tool directories for the eight `code_*` tools + shared tool modules; keep `app/`, `session/`, `substrate/`, `analysis/`, `ui/` |
| `supi-code-runtime` | library-only: flat source with `capability/` + `workspace/`; no pi extension |
| `supi-agent` | per-tool `tool/agent_run/`; catalogue/resource-policy slice stays at root |
| `supi-agent-runtime` | library-only: flat lifecycle/diagnostics source; no pi extension |
| `supi-context` | root domains stay; per-tool `tool/<tool>/` layout |
| `supi-core` | domain-first if reorganized: `config/`, `context/`, `settings/` |
| `supi-debug` | root domains stay; per-tool `tool/debug/` layout |
| `supi-extras` | mostly flat; split only if coherent domains emerge |
| `supi-insights` | flat source is fine; move tests to package-level `__tests__/unit/` |
| `supi-lsp` | hybrid large-package layout with `client/`, `config/`, `diagnostics/`, `manager/`, `provider/`, `session/` |
| `supi-review` | per-tool `tool/review_run/`, `tool/review_output/`, `tool/review_audit/` + shared tool modules; keep package domains (`audit/`, `target/`, `history/`) |
| `supi-skill-patches` | private maintenance package: flat patch, upstream sync, and root skill catalog validation |
| `supi-skills` | flat skill controls and input shortcuts domain |
| `supi-test-utils` | stay flat utility package |
| `supi-tree-sitter` | hybrid: root surfaces + `tool/` + `session/` |
| `supi-web` | per-tool directories for the web tools; shared fetch/convert infra stays at root |

## Package-specific examples

### `supi-insights`

Move tests out of `src/__tests__/` into package-level `__tests__/unit/`.

### `supi-lsp`

Use the hybrid structure below without forcing every file into a folder:

```text
src/
  api.ts
  coordinates.ts
  summary.ts
  workspace-path-policy.ts
  utils.ts
  client/
  config/
  diagnostics/
  manager/
  provider/
  session/
```

Keep ambiguous utilities at the root until they clearly belong somewhere.

## Adoption status

This convention is the default for new packages and for existing packages receiving structural work. Per-package target shapes and flat-package lists live in the matrix above.

Per-tool layout migration: complete. All tool packages (`supi-review`, `supi-agent`, `supi-ask-user`, `supi-cache`, `supi-code-intelligence`, `supi-context`, `supi-debug`, `supi-web`) use per-tool directories.
