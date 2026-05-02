## Context

`supi-ask-user` currently branches at runtime between two UI paths:

1. **Rich overlay** (`ui-rich.ts`) — uses `ctx.ui.custom()` to render an interactive TUI overlay with preview panes, inline editing, notes, and review.
2. **Dialog fallback** (`ui-fallback.ts`) — uses `ctx.ui.select()`/`input()` when `custom()` is unavailable, flattening rich affordances into numbered dialog lists.

The fallback path was originally added for environments lacking custom overlay support. In practice, every pi session that supports tools also supports `ctx.ui.custom()`. The fallback code is ~300 lines plus ~200 lines of tests, and it duplicates questionnaire flow logic that the overlay already covers via `QuestionnaireFlow`.

## Goals / Non-Goals

**Goals:**
- Delete `ui-fallback.ts` and all fallback-specific test files.
- Simplify `ask-user.ts` to a single UI path.
- Return an explicit error when `custom()` is unavailable instead of silently degrading.
- Update the `ask-user` spec to remove the fallback requirement.

**Non-Goals:**
- Change any rich overlay behavior, schema, or result format.
- Add new features to `ask_user`.
- Preserve `runFallbackQuestionnaire` as a private utility (it has no consumers).

## Decisions

### Decision: Remove fallback entirely rather than deprecate
**Rationale:** The fallback has zero known consumers. Keeping it as deprecated code still incurs test and maintenance cost. A clean removal is simpler.

### Decision: Return an explicit error result when `custom()` is unavailable
**Rationale:** Previously the fallback attempted to provide *some* UX. Without it, the only safe behavior is to tell the agent (and user) that `ask_user` cannot run in this context. This matches the existing `!ctx.hasUI` error path.

The error message will include guidance: `ask_user requires a TUI with custom overlay support. Do not use ask_user in non-interactive or degraded UI sessions.`

### Decision: Simplify `ExtensionUi` interface
**Rationale:** `ExtensionUi` currently requires both `custom` and `select`/`input`. After removal, only `custom` is needed. The interface becomes a thin wrapper around `RichUiHost`.

### Decision: Rewrite `execute.test.ts` with `richCtx` helper
**Rationale:** The existing tests mock `select`/`input` via `fallbackCtx`. These tests exercise the fallback path, which is being deleted. A `richCtx` helper that mocks `custom()` with promise-returning outcomes is needed. The test assertions (concurrency, lock release, abort on cancel, no abort on submit) remain valid and map directly to the rich path.

### Decision: Remove the discuss-through-fallback test
**Rationale:** `execute.test.ts` has a test `can return a discuss answer through the fallback path`. After removal, discuss answers are already exhaustively tested in `ui-rich.test.ts`, so this test is redundant.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| A future pi environment lacks `custom()` | The error result explicitly tells the model not to use `ask_user` in that context. The tool is inherently interactive; a degraded dialog experience was never the intended UX. |
| Tests lose coverage for cancel/abort/submit edge cases | The `execute.test.ts` rewrite covers the same edge cases via the rich path. `ui-rich*.test.ts` already covers discuss, review, multichoice, notes, etc. |
| Breaking change for anyone importing `runFallbackQuestionnaire` | No workspace packages or known external consumers import it. It was only re-exported from `ask-user.ts` for test convenience. |

## Migration Plan

Not applicable — this is an internal package change with no deployment or data migration steps.
