# Task 2: Upgrade anchored code_resolve to resolve real symbol targets

**Description:**

Replace the current anonymous anchored-target behavior with provider-backed symbol resolution.

Today, `code_resolve({ file, line, character })` validates a file and registers a target with `name: null`, `kind: null`, and `anchorKind: "name"` even when the coordinate is on `export`, whitespace, or any arbitrary point. Because target identity excludes position per ADR 0003, unrelated anonymous point targets can collide. This task should fix that root behavior.

Implement layered anchored resolution:

1. Prefer LSP/document-symbol evidence when available.
2. If the requested coordinate is already on the symbol name anchor, return an exact resolved target.
3. If the requested coordinate is inside the declaration/header/modifier area, conservatively snap to the symbol name anchor when exactly one enclosing symbol is identified.
4. Use structural fallback only when unambiguous and provider-backed.
5. If no real symbol target can be resolved, return an explicit unavailable/error result and recommend `code_inspect` for point-level facts.

Do not use heuristic global text search. Do not silently treat declaration anchors as name anchors.

**Files:**

- `packages/supi-code-intelligence/src/targeting/resolve-anchored.ts` — replace anonymous point-target behavior with real anchored symbol resolution or clear unavailable result.
- `packages/supi-code-intelligence/src/analysis/resolve/service.ts` — register resolved symbol targets and attach resolution metadata.
- `packages/supi-code-intelligence/src/targeting/resolve-symbol.ts` — reuse existing anchor refinement/snap helpers where possible.
- `packages/supi-code-intelligence/src/analysis/context/request-context.ts` — use existing semantic/structural providers; avoid new cross-provider coupling beyond the orchestration layer.
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` and `target-resolution.test.ts` — update/add anchored-resolution regressions.

**Acceptance criteria:**

- Exact identifier coordinate resolves to a named target with `anchorKind: "name"`.
- Declaration/header coordinate such as an `export` keyword snaps to the same symbol's name anchor when unambiguous.
- Snapped results show a markdown note and structured resolution metadata containing requested and resolved coordinates.
- Whitespace/comment/non-symbol coordinates do not register targetIds and recommend `code_inspect`.
- Two unrelated arbitrary coordinates in the same file no longer produce colliding anonymous targetIds.
- Ambiguous anchored resolution returns candidates with targetIds and does not pick one silently.
- Existing follow-up calls using targetId for `code_graph(..., relations: ["callees"])` work for snapped name-anchor targets.
