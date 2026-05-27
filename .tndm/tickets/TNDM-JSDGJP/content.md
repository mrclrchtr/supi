# Code Intelligence V2 Phase 0: workflow tool skeleton and in-code design docs

## Problem

The current `@mrclrchtr/supi-code-intelligence` model-facing surface still exposes two different layers at once:

- high-level `code_*` tools: `code_brief`, `code_references`, `code_calls`, `code_implementations`, `code_affected`, `code_pattern`, `code_refactor_plan`, `code_refactor_apply`
- substrate expert tools: `lsp_*` and `tree_sitter_*`

The long-term goal is to reduce prompt and JSON-schema noise by making the model use workflow-oriented `code_*` tools only. LSP and tree-sitter should remain implementation substrates, not public choices the model has to reason about.

Phase 0 does **not** change runtime behavior. It creates the skeleton and comprehensive in-code documentation needed to make later phases safe, reviewable, and small.

## Approved direction

Move toward a V2 workflow-oriented public surface:

1. `code_resolve` — resolve human/code references into stable targets.
2. `code_context` — task-focused context bundles; successor to `code_brief`.
3. `code_find` — unified text/regex/AST/semantic search; successor to `code_pattern`.
4. `code_graph` — unified relation graph; successor to `code_references`, `code_calls`, and `code_implementations`.
5. `code_impact` — blast radius for a symbol, files, dirty diff, or proposed change; successor to `code_affected`.
6. `code_refactor` — operation-specific semantic/safe refactor planning; successor/generalization of `code_refactor_plan` for rename and future refactors.
7. `code_apply` — explicit application of stored plans; successor to `code_refactor_apply`.
8. `code_health` — diagnostics/status/dirty/coverage/unused summary; replacement for public `lsp_diagnostics`, `lsp_recover`, and status-like substrate access.

Raw `lsp_*` and `tree_sitter_*` tools are planned for removal from the public model-facing tool surface in a later implementation phase, after the V2 code tools cover their high-value use cases.

## Phase 0 scope

Phase 0 creates an internal skeleton only:

- Add in-code contracts for workflow handles: `targetId`, `spanId`, `graphNodeId`, `planId`, `changeId`.
- Add shared result-envelope and provenance types for future V2 tools.
- Add planned V2 tool-surface metadata with exhaustive JSDoc explaining purpose, schema strategy, absorbed current tools, non-goals, and future phase mapping.
- Add planned TypeBox schemas for the V2 tools so the property and JSON-schema design is explicit before behavior changes.
- Add tests that lock the skeleton shape and assert Phase 0 does not register V2 tools or remove current tools.
- Update package docs/maintainer notes to point future agents at the skeleton and make the non-behavioral scope explicit.

## Phase 0 non-goals

- Do not remove `lsp_*` or `tree_sitter_*` tool registration yet.
- Do not register any V2 workflow tool yet.
- Do not rename existing public tools yet.
- Do not change `code_brief`, `code_references`, `code_calls`, `code_implementations`, `code_affected`, `code_pattern`, `code_refactor_plan`, or `code_refactor_apply` behavior.
- Do not add natural-language search unless a real implementation exists.
- Do not add a generic `code_plan` tool in Phase 0; general implementation planning remains chat/TNDM-driven, while `code_refactor` will own precise edit/refactor plans.
- Do not mutate files outside the planned skeleton/docs/tests.

## Schema design principles

1. **Workflow intent beats substrate naming.** Public tools should express tasks such as resolving, finding context, graphing relationships, estimating impact, planning/applying refactors, and checking health.
2. **Handles are the preferred linking mechanism.** Future tools should accept `targetId`, `spanId`, `graphNodeId`, and `planId` so agents do not repeatedly pass fragile file/line/character coordinates.
3. **Flat schemas are preferred.** Avoid complex `oneOf`/deep union schemas because LLM tool callers handle flat optional fields more reliably.
4. **Runtime validation handles cross-field rules.** TypeBox schemas describe property shapes; executors validate rules such as "line/character require file" or "targetId/change/changedFiles is required".
5. **Enums are acceptable when result shape is cohesive.** `code_find.mode`, `code_graph.relations`, and `code_refactor.operation` are acceptable because each tool still has one coherent intent.
6. **No broad action mega-tool.** Do not collapse unrelated workflows into one `code` tool with an `action` parameter.
7. **Structured data plus markdown.** Future tool results should expose structured fields for the model and markdown for human readability.
8. **Mutation is always plan/apply.** Refactors and codemods should produce plans first and apply only through `code_apply` or an explicit apply mode.

## Planned V2 schema sketches

### `code_resolve`

Purpose: resolve a human/code reference into precise targets and stable IDs.

Core fields:

- `query?: string`
- `scope?: string`
- `kind?: "symbol" | "function" | "class" | "interface" | "type" | "file" | "export" | "command" | "setting"`
- `file?: string`
- `line?: number`
- `character?: number`
- `maxResults?: number`

Runtime validation: require `query` or `file`; `line`/`character` require `file`.

### `code_context`

Purpose: task-focused context bundle.

Core fields:

- `task?: string`
- `targetId?: string`
- `scope?: string`
- `budget?: "small" | "medium" | "large"`
- `include?: ["defs", "references", "callees", "tests", "docs", "diagnostics", "exports", "imports"]`
- `maxResults?: number`

If `task` is omitted, this can behave like current orientation/brief behavior.

### `code_find`

Purpose: unified search.

Core fields:

- `query: string`
- `scope?: string`
- `mode?: "text" | "regex" | "ast" | "semantic"`
- `kind?: "definition" | "import" | "export" | "call" | "type" | "test"`
- `contextLines?: number`
- `maxResults?: number`

Default mode should be literal text search. Natural-language search is intentionally deferred.

### `code_graph`

Purpose: unified relation graph.

Core fields:

- `targetId?: string`
- `relations?: ["references", "callees", "imports", "exports", "implements", "tests"]`
- `direction?: "in" | "out" | "both"`
- `depth?: number`
- `maxNodes?: number`

Use `references` unless true caller/call-hierarchy evidence exists. Do not label LSP references as callers.

### `code_impact`

Purpose: blast radius for an actual or proposed change.

Core fields:

- `targetId?: string`
- `change?: string`
- `changedFiles?: string[]`
- `baseRef?: string`
- `includeTests?: boolean`
- `maxResults?: number`

Runtime validation: require one of `targetId`, `change`, or `changedFiles`.

### `code_refactor`

Purpose: create operation-specific precise refactor plans.

Core fields:

- `operation: "rename_symbol" | "rename_file" | "move_file" | "update_imports" | "delete_dead_code"`
- `targetId?: string`
- `file?: string`
- `line?: number`
- `character?: number`
- `newName?: string`
- `destination?: string`
- `preview?: boolean`

Phase 1+ implementations can start with `rename_symbol` only. Phase 0 documents the broader design without implementing the operations.

### `code_apply`

Purpose: apply stored plans explicitly.

Core fields:

- `planId: string`
- `mode?: "apply" | "apply-and-format" | "apply-and-verify"`

Must enforce fingerprints, validation, and rollback in implementation phases.

### `code_health`

Purpose: workspace/package/file health summary.

Core fields:

- `scope?: string`
- `refresh?: boolean`
- `include?: ["diagnostics", "servers", "dirty", "coverage", "unused"]`
- `level?: "summary" | "detailed"`

This replaces public diagnostic/recover/status substrate tools once implemented.

## File structure for Phase 0

Create:

- `packages/supi-code-intelligence/src/workflow/ids.ts` — handle/ID branded types and documentation.
- `packages/supi-code-intelligence/src/workflow/results.ts` — shared structured result envelope, provenance, span, and next-action types.
- `packages/supi-code-intelligence/src/workflow/schemas.ts` — TypeBox schemas for planned V2 tool parameters, with flat property shapes and JSDoc cross-field rules.
- `packages/supi-code-intelligence/src/workflow/surface.ts` — canonical planned V2 surface metadata: tool names, purpose, absorbed existing tools, substrate dependencies, schema key, phase mapping, and non-goals.
- `packages/supi-code-intelligence/src/workflow/index.ts` — internal barrel for tests/future implementation.
- `packages/supi-code-intelligence/__tests__/unit/workflow-surface.test.ts` — shape/coverage tests for the skeleton.

Modify:

- `packages/supi-code-intelligence/README.md` — add a V2 workflow roadmap section and clarify Phase 0 is non-behavioral.
- `packages/supi-code-intelligence/CLAUDE.md` — add maintainer notes for the V2 skeleton and future phase boundaries.

Do not modify runtime registration wiring in Phase 0 except if tests require imports that prove current behavior remains unchanged.

## Future phase roadmap

Each future phase should be its own ticket with verification, user review, and commit before the next phase.

1. **Phase 1: `code_resolve` handles.** Implement target/span IDs, target cache, disambiguation, and compatibility with current file/line/symbol target resolution.
2. **Phase 2: `code_context` and `code_find`.** Register successors to `code_brief` and `code_pattern` while keeping compatibility aliases if needed during migration.
3. **Phase 3: `code_graph`.** Merge references/calls/implementations into graph DTOs and renderers; keep evidence labels honest.
4. **Phase 4: `code_impact`.** Generalize current affected analysis to proposed changes, dirty files, imports/exports, docs/tests, and diagnostics risk.
5. **Phase 5: `code_refactor` and `code_apply`.** Replace rename plan/apply surface with operation-oriented refactor planning and explicit plan application.
6. **Phase 6: `code_health` and substrate removal.** Add health/status/diagnostics replacement, then stop registering public `lsp_*` and `tree_sitter_*` tools.
7. **Phase 7: cleanup and docs sweep.** Remove stale compatibility modules only after replacement behavior and docs have been verified.

## Verification strategy

Phase 0 is testable even though it does not change runtime behavior:

- Unit tests assert the planned workflow surface contains exactly the approved tool names.
- Unit tests assert no planned public V2 tool name starts with `lsp_` or `tree_sitter_`.
- Unit tests assert each planned tool has purpose docs, schema docs, absorbed current tools, and phase mapping.
- Unit tests assert schemas avoid broad `action` mega-tool patterns except the intentionally scoped `operation` field in `code_refactor`.
- Extension-registration tests continue to prove current behavior remains unchanged during Phase 0.
- Typecheck and Biome verify the skeleton is valid and maintainable.

## Success criteria

- The planned V2 surface is documented in code with exact tool names and schemas.
- Future agents can open `src/workflow/` and understand the target architecture without re-reading this conversation.
- Phase 0 introduces no public runtime tool behavior changes.
- Existing tests remain green.
- Package README and CLAUDE notes accurately describe the roadmap and phase boundaries.
