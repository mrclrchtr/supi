## What to build

Make precise-coordinate workflows in `supi-code-intelligence` resolve to real code targets instead of anonymous point targets, then let `code_context` use that resolution path directly.

The end-to-end behavior should support a new-session agent that starts from a known source location:

- `code_resolve({ file, line, character })` resolves a real symbol target where possible, with a stable `targetId`, name/kind metadata, anchor-kind metadata, and structured resolution details.
- Declaration/header coordinates such as an `export` keyword can conservatively snap to the symbol name anchor when provider-backed evidence identifies exactly one target.
- Non-symbol coordinates fail honestly and recommend `code_inspect` for point-level facts.
- `code_context({ file, line, character, ... })` uses the same anchored resolution path internally, runs context sections only for a resolved target, and exposes the resolved target metadata for follow-up tool calls.

Respect the existing domain model and ADRs:

- `Name anchor` and `Declaration anchor` remain distinct per ADR 0003.
- Snapping is allowed only when provider-backed and unambiguous.
- `scope` remains a selection/orientation boundary; it is not a downstream evidence filter.
- `targetId` takes precedence over coordinates; invalid/stale target IDs must not fall back to coordinates.

## Acceptance criteria

- [ ] `code_resolve` anchored coordinates no longer register anonymous point targets for symbol positions.
- [ ] Exact identifier coordinates resolve to named targets with `targetId`, `spanId`, `name`, `kind`, `anchorKind`, and resolution metadata.
- [ ] Declaration/header coordinates snap to the name anchor only when one provider-backed target is unambiguous, with a markdown note and structured resolution metadata.
- [ ] Whitespace/comment/non-symbol coordinates return an explicit unavailable/error result and recommend `code_inspect`.
- [ ] Anchored target IDs do not collide across unrelated point locations or anonymous targets.
- [ ] `code_context` accepts `file` + `line` + `character` as a coordinate target mode.
- [ ] `code_context` coordinate mode uses the same resolution/store path as `code_resolve`.
- [ ] `code_context` exposes resolved target metadata in markdown and `details.data.target` for both coordinate and targetId inputs.
- [ ] `code_context` returns candidate targetIds when coordinate resolution is ambiguous and does not run context sections in that case.
- [ ] When both `targetId` and coordinates are supplied, `targetId` wins and a visible note says coordinates were ignored.
- [ ] If a supplied `targetId` is stale/invalid, the tool errors and does not fall back to coordinates.
- [ ] If a precise target and `scope` are both supplied, the precise target wins and a visible note says `scope` was ignored.
- [ ] Tool descriptions, workflow schemas, README/package agent notes, and structured details types are updated.
- [ ] Tests cover exact hit, declaration snap, unresolved coordinate, ambiguity/candidate targetIds, targetId precedence, stale targetId no-fallback, scope ignored, and live-style `callees` context from coordinates.
- [ ] `pnpm verify:ai` passes.

## Blocked by

None - can start immediately
