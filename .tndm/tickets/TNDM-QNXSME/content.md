# supi-code-intelligence: tool-guidance compliance pass

Improve `packages/supi-code-intelligence` to comply with `docs/pi/tool-guidance.md`.
Decisions grilled and recorded in ADR 0005 (prompt-surface division of labor)
and ADR 0006 (refactor-apply file-mutation queue). Renderers deferred to a
follow-up task.

## Decisions

- **A signal/onUpdate (Deep):** executor contract `(params, { cwd, signal, onUpdate })`;
  adapter passes signal/onUpdate through; `runRipgrepJson` → async `spawn` + `AbortSignal`;
  signal forwarded to LSP/tree-sitter where accepted; onUpdate emitted from
  code_find, code_impact, code_graph(relations:all), code_health(refresh),
  code_refactor_plan; others accept and no-op.
- **B truncation (adapter-uniform):** adapter truncates content with
  `truncateHead` at pi defaults (2000 lines / 50KB) + `[truncated]` notice;
  opt-in temp-file spill for code_find/code_graph:all/code_impact; per-spec
  `maxLines`/`maxBytes` override knob (unused); details never truncated;
  truncation clause in each description.
- **C refactor-apply queue:** wrap precompute-then-commit in
  `withFileMutationQueue` per file in sorted path order, keep cross-file
  rollback; no executionMode change.
- **D token efficiency (dedupe):** descriptions own complete always-on
  contract + full mechanics; guidelines shrink to ≤5 selection/execution
  bullets naming the tool; preserve test-pinned substrings; append truncation
  clauses.
- **H throw policy (hybrid):** throw for whole-tool capability-unavailable
  (consistency: code_graph/code_resolve/code_refactor_plan match code_find);
  keep error text for self-correctable invalid usage; keep best-effort notes;
  rewrite package CLAUDE.md gotcha to state the 3-way policy.

## Not-gaps (no action)
Path @-normalization, StringEnum, additionalProperties:false, promptSnippet,
prepareArguments, terminate, exported input types, ctx.hasUI/ctx.mode.

## Verification
`pnpm verify:ai` after each chunk. Preserve pinned substrings in
`extension-registration.test.ts`.