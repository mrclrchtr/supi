# Task 3: Add coordinate target mode to code_context

**Description:**

Let new-session agents call `code_context` directly with `file + line + character` instead of requiring a separate `code_resolve` turn.

Coordinate mode must use the same anchored resolution/store path as `code_resolve` after Task 2. It must not implement a separate point-context mode and must not silently accept arbitrary coordinates as target anchors.

Rules to implement:

- `targetId` wins when both `targetId` and coordinates are supplied.
- If `targetId` wins, ignore coordinates and show a visible guidance note.
- If a supplied `targetId` is invalid/stale, return that error and do not fall back to coordinates.
- Coordinate mode requires all of `file`, `line`, and `character` when any coordinate field is present.
- Coordinate mode resolves/registers a target through the same resolve service path as `code_resolve`.
- Coordinate mode runs context sections only when exactly one target is resolved.
- Ambiguous coordinate resolution returns candidate targetIds and does not run context sections.
- Unresolved coordinates return an explicit unavailable/error result and recommend `code_inspect`.
- A precise target plus `scope` means target wins; `scope` is ignored with a visible note.

**Files:**

- `packages/supi-code-intelligence/src/workflow/schemas.ts` — add public `file`, `line`, `character` parameters to `CodeContextParameters`.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — update tool description/guidelines for targetId vs coordinate mode.
- `packages/supi-code-intelligence/src/tool/execute-context.ts` — implement targetId precedence, coordinate resolution, scope ignore notes, ambiguous/unresolved handling, and target metadata in details.
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` — keep target-oriented context behavior; do not add point-context fallback.
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` and `details-metadata.test.ts` — add full public-tool regressions.

**Acceptance criteria:**

- `code_context({ task, file, line, character, include: ["callees"] })` resolves the target and renders direct structural callees for a valid symbol coordinate.
- The context markdown includes resolved target information and targetId for coordinate mode.
- `details.data.target` is populated for both coordinate mode and targetId mode.
- Passing both targetId and coordinates succeeds using targetId and includes a visible note that coordinates were ignored.
- Stale/invalid targetId does not fall back to coordinates.
- Passing partial coordinates returns a clear validation error.
- Passing `scope` with a precise target succeeds using the target and includes a visible note that scope was ignored.
- Ambiguous coordinate resolution returns candidates with targetIds and no task sections.
- Unresolved coordinate recommends `code_inspect`.
