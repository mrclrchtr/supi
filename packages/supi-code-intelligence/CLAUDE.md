# @mrclrchtr/supi-code-intelligence

Code understanding, navigation, search, health, and semantic refactoring for PI. Registers exactly eight public `code_*` tools.

Surfaces: `./extension` (PI registration) and `./api` (reusable type contracts). Reads capability state from `@mrclrchtr/supi-code-runtime` and attaches the workspace LSP runtime; it does not expose providers, clients, or managers through workflow outcomes.

## Source modules

| Module | Directory | Role |
|---|---|---|
| Entry | `src/extension.ts`, `src/app/` | PI wiring, composition, session lifecycle |
| Public tools | `src/tool/<tool>/` | Thin executors and presentation adapters |
| Tool metadata | `src/tool/specs.ts`, `schemas.ts`, `guidance.ts` | Canonical eight-tool surface |
| Result assembly | `src/tool/result/` | Sections, evidence lists, totals, provenance, actions, details |
| Workflows | `src/session/` | Workspace session, typed outcomes, target handles, refactor plans |
| Analysis | `src/analysis/` | PI-free evidence collection and refactor safety |
| Substrates | `src/substrate/` | Process-shared LSP and Tree-sitter provider-host lifecycle |
| Shared UI | `src/ui/` | Status, footer, and shared TUI/markdown helpers |

## Public tool gotchas

- **`code_orientation`**: omitted `focus` means workspace. Otherwise use exactly one of `focus.path`, `focus.module`, or `focus.target`. On-demand workspace/path facts are direct filesystem observations, parsed manifest/workspace configuration, or explicit providers; manifest-declared topology is not a runtime architecture graph. Directory focus surfaces configured instruction files once per session branch.
- **`code_inspect`**: requires `point: { file, line, character }`; it validates a readable regular file and UTF-16 bounds before providers, reports only point-local facts, preserves completed-empty/partial/unavailable state per section, selects the narrowest provider-reported enclosing range, and throws only when every inspection substrate is unavailable.
- **`code_graph`**: accepts exactly one target handle/anchor/symbol. Relations are only `references`, structural `callees`, and `implements`; `all` means exactly those three. Callees are source-shape calls, not symbol identity. Semantic provider locations are canonically normalized before containment, declaration filtering, and deterministic deduplication; invalid locations are disclosed as partial evidence rather than counted as external.
- **`code_find`**: `mode` is required and exactly `ast | semantic`; literal/regex search belongs to PI grep. AST kinds are exactly `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, and `enum`; test identity is not inferred. AST `call` matches by written name. Modes never silently fall back. `scope`, when present, is a non-empty string array. AST mode uses the owned, operation-aware Scan policy documented in the README: exact operation-ineligible files are invalid, unsupported-only directories are unavailable, mixed scopes disclose policy exclusions without becoming partial, and runtime limitations remain partial.
- **`code_resolve`**: anchored resolution requires a real symbol. Whitespace/comment coordinates fail and recommend `code_inspect`. File selectors enumerate all declarations but materialize handles only for the bounded visible Target group, never a synthetic file-position handle. Canonical declaration line/occurrence distinguishes overloads; preferred display/name-anchor position is not identity. Exact structural name-anchor evidence may refine an underspecified LSP kind for identity without changing its displayed Provider-reported symbol kind. `symbolKind` is a strict provider-reported LSP kind filter; a valid query with only wrong-kind candidates returns a typed Symbol-kind mismatch with bounded handles.
- **`code_refactor_plan`**: target is exactly one handle or anchor; operation is exactly one nested `rename_symbol`, `extract_function`, or `extract_variable` payload. No `rename` alias.
- **`code_refactor_apply`**: revalidates SHA-256 fingerprints and edit safety. It acquires sorted per-file mutation queues and preserves cross-file rollback.
- **`code_health`**: reports live `diagnostics` and `servers` observations. Capability Warnings supplement diagnostic/server requests; they are not an `include` section.

`code_impact` and old flat input shapes are removed, not aliased.

## Workspace session and result assembly

`WorkspaceCodeIntelligenceSession` owns target resolution, readiness, provider selection, workflow coordination, target/plan state, cancellation/progress, and overview/instruction deduplication. Workflows return immutable typed outcomes.

`src/tool/result/assembly.ts` is the sole shared result-policy module. Graph evidence is bounded there once so Markdown and structured details consume the same list metadata. Markdown and TUI consume assembled facts independently. Do not collect evidence in renderers or parse markdown in TUI code.

Whole-workflow capability unavailable → throw from `execute()` so PI marks a real tool failure. Invalid usage → return error text so the model can self-correct. Zero matches are successful results.

## Tool adapter contract

- `src/tool/register.ts` truncates content at PI defaults (2000 lines / 50 KB); details remain structured and untruncated. Full content spills to a temporary file.
- `src/headless.ts` is the managed-child profile. It registers exactly `code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_find`, and `code_health`; never add refactors, settings, UI, commands, or overview injection there.
- Forward `signal` and `onUpdate` through `toWorkflowControl()`. The tool adapter derives one absolute deadline per public call (`DEFAULT_WORKFLOW_DEADLINE_MS`). Every workflow must pass the exact signal/deadline control to its provider. AST Scan creates one shared absolute deadline for enumeration and substrate work.
- PI schema validation is not enough: workflow validation must protect direct callers.
- Exact-one schemas use closed one-key objects rather than TypeBox unions/literals for model-provider compatibility.

## Target resolution

- Target selectors are nested; there is no input precedence.
- Establishment and refinement are LSP-first. Readiness requires a concrete active workspace client or successfully routed file client; runtime ownership is insufficient. Tree-sitter only supplements after semantic readiness and cannot create a target by itself.
- Anchored resolution and symbol resolution converge in `src/session/target-workflow.ts` and `target-store.ts`.
- File discovery returns a bounded Target group derived from every provider-reported declaration (including nested declarations), with exact completeness, canonical cross-provider matching, successful discovery-provider provenance, and conservative aggregate confidence across the complete group. Provider-proven top-level declarations rank first; nested and unknown-nesting declarations remain source-ordered, and unknown nesting is counted explicitly rather than inferred from a nullable container. Every flat LSP `SymbolInformation` remains unknown even when `containerName` metadata is present. It fingerprints once and registers only visible members. Empty files return successful empty groups.
- Position-strict consumers require a name anchor (ADR 0003); repeated observations refine declaration anchors and confidence without collapsing overloads. Target provider provenance is a typed `semantic | structural` set that unions monotonically, independent of confidence; selector origin is not provider provenance.
- Unknown or stale handles fail explicitly; no fallback to another selector. Existing fresh handles may still serve structural consumers after LSP loss.

## Provider/runtime contract

Each registered public `code_*` call derives one opaque Debug Operation ID in the registration closure. Forward it only through explicit `WorkflowControl` and `CodeRequestControl`. Never retain or forward Pi's raw `toolCallId`, use async context, or add the opaque ID to normal Tool results. Ambient lifecycle events and direct library calls have no ID.

`WorkspaceCapabilityAdapter` reads `supi-code-runtime` capability state and the `WorkspaceLspRuntime`. `Workspace provider host` is process-shared and reference-counted by canonical workspace; it starts LSP and exactly one Tree-sitter Structural Worker, then awaits shutdown after the final session lease. Parser-backed work never falls back to the parent thread. Target/refactor stores remain session-local. `TestCapabilityAdapter` is the in-memory workflow-test seam. Read-only semantic providers return `CodeQueryResult<T>`; completed empty data must not be inferred as unavailable. When provider contracts change, update the LSP runtime, composite provider, test adapter, and behavior tests together.

## Always-on LSP policy

- `lsp.enabled` and `lsp.active` are deprecated and ignored.
- Per-language opt-out is `lsp.servers.<language>.enabled: false`; if all definitions are disabled, the controller publishes `disabled`, not `ready`.
- Server-inventory evidence is distinct from the authoritative five-branch Semantic health state. Diagnostics require an active ready server, not merely a ready runtime owner; concrete ready-server evidence wins over lagging capability publication. Diagnostic refresh attempts recovery before the final state is derived.
- Deprecated keys surface through `/supi-ci-status`, `code_health`, and a one-time message after the grace period.

## Refactor safety

Planning and application remain separate (ADR 0002). `validateEditAgainstFiles()` rejects invalid/overlapping edits. Application holds sorted file queues while rereading, validating, transforming, and committing. If a later write fails, earlier writes are rolled back.

## First-turn overview

The hidden architecture overview is claimed atomically through session behavior and injected with `display: false` only while `code-intelligence.overviewEnabled` resolves true (default; project-scoped values apply only for trusted projects, and non-boolean values fail closed). It renders every discovered module, one-line manifest description, entrypoint, and manifest-declared relationship without truncation; descriptions and other repository facts are labeled as untrusted evidence, never instructions. The token budget (1000) only emits a `supi:debug` warning. The setting is pinned once per session — no mid-session toggle. Reload/resume reconstruction scans for the existing `code-intelligence-overview` custom message. Do not expose session state fields to app wiring.

## TUI rendering

Per-tool `renderCall`/`renderResult` live under `src/tool/<tool>/tui.ts`. `renderShell: "self"` strips PI's Box entirely; avoid it unless full-screen control is required.

## Verification

Use focused TypeScript/Vitest commands while iterating, then run `pnpm verify:ai`.

## License

MIT
