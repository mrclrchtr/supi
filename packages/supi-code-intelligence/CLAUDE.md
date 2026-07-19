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
| Substrates | `src/substrate/` | LSP and Tree-sitter lifecycle adapters |
| Shared UI | `src/ui/` | Status, footer, and shared TUI/markdown helpers |

## Public tool gotchas

- **`code_orientation`**: omitted `focus` means workspace. Otherwise use exactly one of `focus.path`, `focus.module`, or `focus.target`. Directory focus surfaces configured instruction files once per session branch.
- **`code_inspect`**: requires `point: { file, line, character }`; it reports local facts and throws when every inspection substrate is unavailable.
- **`code_graph`**: accepts exactly one target handle/anchor/symbol. Relations are only `references`, structural `callees`, and `implements`; `all` means exactly those three. Callees are source-shape calls, not symbol identity.
- **`code_find`**: AST `call` matches by written name. Modes never silently fall back. Scope is always an explicit non-empty string array.
- **`code_resolve`**: anchored resolution requires a real symbol. Whitespace/comment coordinates fail and recommend `code_inspect`. File selectors enumerate all declarations but materialize handles only for the bounded visible Target group, never a synthetic file-position handle. Canonical declaration line/occurrence distinguishes overloads; preferred display/name-anchor position is not identity.
- **`code_refactor_plan`**: target is exactly one handle or anchor; operation is exactly one nested `rename_symbol`, `extract_function`, or `extract_variable` payload. No `rename` alias.
- **`code_refactor_apply`**: revalidates SHA-256 fingerprints and edit safety. It acquires sorted per-file mutation queues and preserves cross-file rollback.
- **`code_health`**: coverage and unused-report paths are locators only; a miss means unavailable at that path, not global absence.

`code_impact` and old flat input shapes are removed, not aliased.

## Workspace session and result assembly

`WorkspaceCodeIntelligenceSession` owns target resolution, readiness, provider selection, workflow coordination, target/plan state, cancellation/progress, and overview/instruction deduplication. Workflows return immutable typed outcomes.

`src/tool/result/assembly.ts` is the sole shared result-policy module. Graph evidence is bounded there once so Markdown and structured details consume the same list metadata. Markdown and TUI consume assembled facts independently. Do not collect evidence in renderers or parse markdown in TUI code.

Whole-workflow capability unavailable → throw from `execute()` so PI marks a real tool failure. Invalid usage → return error text so the model can self-correct. Zero matches are successful results.

## Tool adapter contract

- `src/tool/register.ts` truncates content at PI defaults (2000 lines / 50 KB); details remain structured and untruncated. Full content spills to a temporary file.
- Forward `signal` and `onUpdate` through `toWorkflowControl()`.
- PI schema validation is not enough: workflow validation must protect direct callers.
- Exact-one schemas use closed one-key objects rather than TypeBox unions/literals for model-provider compatibility.

## Target resolution

- Target selectors are nested; there is no input precedence.
- Establishment and refinement are LSP-first. Readiness requires a concrete active workspace client or successfully routed file client; runtime ownership is insufficient. Tree-sitter only supplements after semantic readiness and cannot create a target by itself.
- Anchored resolution and symbol resolution converge in `src/session/target-workflow.ts` and `target-store.ts`.
- File discovery returns a bounded Target group derived from every provider-reported declaration (including nested declarations), with exact completeness, canonical cross-provider matching, and per-member provenance. It fingerprints once and registers only visible members. Empty files return successful empty groups.
- Position-strict consumers require a name anchor (ADR 0003); repeated observations refine declaration anchors, confidence, and provenance monotonically without collapsing overloads.
- Unknown or stale handles fail explicitly; no fallback to another selector. Existing fresh handles may still serve structural consumers after LSP loss.

## Provider/runtime contract

`WorkspaceCapabilityAdapter` reads `supi-code-runtime` capability state and the `WorkspaceLspRuntime`. `TestCapabilityAdapter` is the in-memory workflow-test seam. When provider contracts change, update the composite provider and behavior tests together.

## Always-on LSP policy

- `lsp.enabled` and `lsp.active` are deprecated and ignored.
- Per-language opt-out is `lsp.servers.<language>.enabled: false`; if all definitions are disabled, the controller publishes `disabled`, not `ready`.
- Server-inventory evidence is distinct from semantic availability. Only a live owner or explicit disabled state establishes complete inventory; diagnostics require an active ready server, not merely a ready runtime owner. Diagnostic refresh attempts recovery before availability is recomputed.
- Deprecated keys surface through `/supi-ci-status`, `code_health`, and a one-time message after the grace period.

## Refactor safety

Planning and application remain separate (ADR 0002). `validateEditAgainstFiles()` rejects invalid/overlapping edits. Application holds sorted file queues while rereading, validating, transforming, and committing. If a later write fails, earlier writes are rolled back.

## First-turn overview

The hidden architecture overview is claimed atomically through session behavior and injected with `display: false`. Reload/resume reconstruction scans for the existing `code-intelligence-overview` custom message. Do not expose session state fields to app wiring.

## TUI rendering

Per-tool `renderCall`/`renderResult` live under `src/tool/<tool>/tui.ts`. `renderShell: "self"` strips PI's Box entirely; avoid it unless full-screen control is required.

## Verification

Use focused TypeScript/Vitest commands while iterating, then run `pnpm verify:ai`.

## License

MIT
