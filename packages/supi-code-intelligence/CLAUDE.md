# @mrclrchtr/supi-code-intelligence

Keep `src/analysis/` independent of Pi. It owns evidence collection and refactor safety. Workflow outcomes must not expose providers, clients, or managers.

## Public tool gotchas

- **`code_orientation`**: On-demand workspace/path facts are direct filesystem observations, parsed manifest/workspace configuration, or explicit providers; manifest-declared topology is not a runtime architecture graph. Directory focus surfaces configured instruction files once per session branch.
- **`code_inspect`**: validates a readable regular file and UTF-16 bounds before providers, reports only point-local facts, preserves completed-empty/partial/unavailable state per section, selects the narrowest provider-reported enclosing range, and throws only when every inspection substrate is unavailable.
- **`code_graph`**: Callees are source-shape calls, not symbol identity. Semantic provider locations are canonically normalized before containment, declaration filtering, and deterministic deduplication; invalid locations are disclosed as partial evidence rather than counted as external.
- **`code_find`**: Test identity is not inferred. AST `call` matches by written name. Modes never silently fall back. AST mode uses the owned, operation-aware Scan policy documented in the README: exact operation-ineligible files are invalid, unsupported-only directories are unavailable, mixed scopes disclose policy exclusions without becoming partial, and runtime limitations remain partial.
- **`code_resolve`**: anchored resolution requires a real symbol. Whitespace/comment coordinates fail and recommend `code_inspect`. File selectors enumerate all declarations but materialize handles only for the bounded visible Target group, never a synthetic file-position handle. Canonical declaration line/occurrence distinguishes overloads; preferred display/name-anchor position is not identity. Exact structural name-anchor evidence may refine an underspecified LSP kind for identity without changing its displayed Provider-reported symbol kind. `symbolKind` is a strict provider-reported LSP kind filter; a valid query with only wrong-kind candidates returns a typed Symbol-kind mismatch with bounded handles.
- **`code_refactor_plan`**: Read `src/session/refactor-types.ts` and `src/tool/schemas.ts` for supported names and payloads.
- **`code_refactor_apply`**: revalidates SHA-256 fingerprints and edit safety. It acquires sorted per-file mutation queues and preserves cross-file rollback.

## Workspace session and result assembly

`WorkspaceCodeIntelligenceSession` owns target resolution, readiness, provider selection, workflow coordination, target/plan state, cancellation/progress, and overview/instruction deduplication. Workflows return immutable typed outcomes.

`src/tool/result/assembly.ts` is the sole shared result-policy module. Graph evidence is bounded there once so Markdown and structured details consume the same list metadata. Markdown and TUI consume assembled facts independently. Do not collect evidence in renderers or parse markdown in TUI code.

Whole-workflow capability unavailable → throw from `execute()` so PI marks a real tool failure. Invalid usage → return error text so the model can self-correct. Zero matches are successful results.

## Tool adapter contract

- `src/tool/infra/truncate.ts` (`boundCodeToolResult`) truncates content at PI defaults (2000 lines / 50 KB); details remain structured and untruncated. Full content spills to a temporary file. Each tool's `result.ts` owns the final model-visible content and details via its `finish*Result` builder; `execute.ts` only calls the session workflow and delegates.
- `src/headless.ts` is the managed-child profile. It registers exactly `code_resolve`, `code_inspect`, `code_orientation`, `code_graph`, `code_find`, and `code_health`; never add refactors, settings, UI, commands, or overview injection there.
- Forward `signal` and `onUpdate` through `toWorkflowControl()`. The tool adapter derives one absolute deadline per public call (`DEFAULT_WORKFLOW_DEADLINE_MS`). Every workflow must pass the exact signal/deadline control to its provider. AST Scan creates one shared absolute deadline for enumeration and substrate work.
- PI schema validation is not enough: workflow validation must protect direct callers.
- Exact-one schemas use closed one-key objects rather than TypeBox unions/literals for model-provider compatibility.
- Prompt-surface ownership (see `docs/pi/tool-guidance.md`): `description` owns selection rules, preconditions, and no-fallback contracts; `promptSnippet` owns one capability phrase; `promptGuidelines` owns cross-tool routing; schema field descriptions own parameter mechanics. Every model-facing fact lives in exactly one home; duplicates are deleted.
- `/supi-capabilities` can turn eligible `code_*` tools off for one session. The PI startup allowlist still sets the boundary. Keep cross-tool guidance conditional on the named tool being available. Do not assume all `code_*` tools are active together.

## Target resolution

- Establishment and refinement are LSP-first. Readiness requires a concrete active workspace client or successfully routed file client; runtime ownership is insufficient. Tree-sitter only supplements after semantic readiness and cannot create a target by itself.
- Anchored resolution and symbol resolution converge in `src/session/target-workflow.ts` and `target-store.ts`.
- File discovery returns a bounded Target group derived from every provider-reported declaration (including nested declarations), with exact completeness, canonical cross-provider matching, successful discovery-provider provenance, and conservative aggregate confidence across the complete group. Provider-proven top-level declarations rank first; nested and unknown-nesting declarations remain source-ordered, and unknown nesting is counted explicitly rather than inferred from a nullable container. Every flat LSP `SymbolInformation` remains unknown even when `containerName` metadata is present. It fingerprints once and registers only visible members. Empty files return successful empty groups.
- Position-strict consumers require a name anchor (ADR 0003); repeated observations refine declaration anchors and confidence without collapsing overloads. Target provider provenance is a typed `semantic | structural` set that unions monotonically, independent of confidence; selector origin is not provider provenance.
- Unknown or stale handles fail explicitly; no fallback to another selector. Existing fresh handles may still serve structural consumers after LSP loss.

## Provider/runtime contract

Each registered public `code_*` call derives one opaque Debug Operation ID in the registration closure. Forward it only through explicit `WorkflowControl` and `CodeRequestControl`. Never retain or forward Pi's raw `toolCallId`, use async context, or add the opaque ID to normal Tool results. Ambient lifecycle events and direct library calls have no ID.

`WorkspaceCapabilityAdapter` reads `supi-code-runtime` capability state and the `WorkspaceLspRuntime`. `Workspace provider host` is process-shared and reference-counted by canonical workspace; it starts LSP and exactly one Tree-sitter Structural Worker, then awaits shutdown after the final session lease. It loads `code-intelligence.fileAssociations` from trusted project config only and passes one immutable snapshot to both providers. Use an ordered array of `{ pattern, language }` rules. Patterns are case-sensitive globs over workspace-relative paths with `/` separators. Supported forms use `*`, `?`, `**`, character classes, and brace alternatives. Matching uses one compiled rule set, not platform-dependent native glob defaults; rules never expand eligible suffixes. The first match wins; no match keeps the suffix default, including C for `.h`. Only `c` and `cpp` are valid. Global association values do not apply. A host cannot mix trusted and untrusted leases. Parser-backed work never falls back to the parent thread. Target/refactor stores remain session-local. `TestCapabilityAdapter` is the in-memory workflow-test seam. Read-only semantic providers return `CodeQueryResult<T>`; completed empty data must not be inferred as unavailable. When provider contracts change, update the LSP runtime, composite provider, test adapter, and behavior tests together.

## Always-on LSP policy

- Per-language opt-out is `lsp.servers.<language>.enabled: false`; if all definitions are disabled, the controller publishes `disabled`, not `ready`.
- Server-inventory evidence is distinct from the authoritative five-branch Semantic health state. Diagnostics require an active ready server, not merely a ready runtime owner; concrete ready-server evidence wins over lagging capability publication. Diagnostic refresh attempts recovery before the final state is derived.

## Refactor safety

Planning and application remain separate (ADR 0002). `validateEditAgainstFiles()` rejects invalid/overlapping edits. Application holds sorted file queues while rereading, validating, transforming, and committing. If a later write fails, rollback is attempted and failures are reported. There is no durable crash-recovery journal.

## First-turn overview

The hidden Workspace Overview is claimed atomically through session behavior and injected with `display: false` only while `code-intelligence.overviewEnabled` resolves true (default; project-scoped values require trust, and non-boolean values fail closed). It uses the shared workspace observation, including source-only projects. Automatic collection stays within the session working directory. Names and paths have priority over descriptions. Navigation facts have a 1,000 estimated-token warning and a 2,000-token hard cap; workspace/directory Orientation uses 2,000 and 4,000. Estimates use characters divided by four. Warnings go to debug and UI only. Omitted collected facts remain in a complete captured-result file; reading it does not refresh facts. Repository descriptions are attributed, untrusted evidence, never instructions.

The overview setting is fixed for the session. File associations and automatic path rules are fixed for the provider host. End all host leases and start a new session after a config or trust change. Reload/resume and branch reconstruction inspect the active branch for `code-intelligence-overview`; a failed collection releases the claim. Instruction deduplication records only supplied snippets and resets after compaction. Instruction text has a separate budget and must fit the final tool safety limit. Do not expose session state fields to app wiring. See [the bounded observation decision](docs/adr/0003-bounded-workspace-orientation.md).
