# Archive

# TNDM-1Y05KN — verification evidence

## Automated verification (fresh run)

`pnpm verify:ai` — exit 0.

- biome:ai + typecheck:ai: clean
- vitest: **2212 passed | 4 skipped** across 207 test files (+2 skipped)
- pack:verify: all **17 packages verified**

## Live behavioral verification (fresh, post-reload)

Target file: `packages/supi-code-intelligence/src/analysis/references/service.ts` (`collectReferences`, L35).

### Anchored `code_resolve` — real symbol targets, no anonymous point targets
- Exact identifier `35:23` → `collectReferences` Function, `tg-690ec51461b3e7d894f7e2151971`, `semantic`, `anchored`. Named target, not anonymous.
- Declaration-header `35:1` → resolves to the **same** target at `35:23` with note `_Note: snapped from requested coordinate 35:1 to name anchor 35:23 (evidence: semantic)._` No targetId collision; note only on snap.
- Non-symbol `1:1` (comment) → `**Error:** No symbol target resolved ... (on comment) ... use code_inspect for point-level facts`. Honest failure, no fake targetId.

### `code_context` coordinate target mode
- One call `code_context({ file, line, character, include:["callees"] })` → resolved target + reusable `tg-690...` in markdown + callees section ran (`collectCallers`).
- Resolved-target markdown line well-formed: `` `packages/.../service.ts`:35:23 — Target ID: `tg-...` `` (4 backticks, balanced).

### Blocker fix — invalid `scope` ignored for precise targets
- `code_context({ file, line, character, scope:"does-not-exist", include:["callees"] })` → `_Note: scope is ignored for a precise target...` + target used (`collectCallers`), **no hard error**.
- Orientation + invalid scope (no target): `code_context({ scope:"does-not-exist" })` → `**Error:** Scope path not found: does-not-exist` (hard error preserved where scope is the actual selection input).

### `targetId` precedence + stale handling
- Reusable handle downstream: `code_graph(tg-690..., ["callees"])` resolves `collectReferences` → `collectCallers`.
- `targetId` + coordinates both supplied: note `targetId takes precedence over the supplied coordinates; the coordinates were ignored`; used the targetId's target (35:23), not the supplied coordinate (99:5).
- Stale/invalid `targetId` + coordinates: `**Error:** Target ... not found` — **no fallback** to coordinates.

## Structural-fallback confidence (test-verified — not live-triggerable; LSP ready in this session)

`code-context-tool.test.ts` "reports structural confidence for a coordinate resolved via the structural fallback" asserts `details.data.target.confidence === "structural"` and `resolution.source === "structural-identifier"`. Passed in the fresh `pnpm verify:ai` run (not live-triggerable because the semantic provider always wins when LSP is ready).

## Docs accuracy (checked against final code)

Schema, tool-specs, README (×2), CLAUDE (×2) all state `scope` is "ignored with a visible note" when a precise target is supplied — matching the live behavior. `CodeContextParameters` schema exposes `file`/`line`/`character` for coordinate target mode.

## Review history

Two prior critical reviews found: invalid-scope hard-error on precise targets (contradicted docs), malformed resolved-target markdown backticks, hardcoded `confidence:"semantic"` losing structural evidence, and graph/impact coordinate resolution still using the old anonymous resolver. All resolved: the old anonymous `resolveAnchoredTarget` was removed entirely and `resolve-target.ts` now routes anchored coords through `resolveAnchoredSymbolTarget`; confidence is plumbed; markdown is balanced; scope is ignored for precise targets (matching docs), with regression tests added (invalid scope + coord targetId; orientation invalid scope) and the old contradictory `review-fixes.test.ts` case rewritten to the reconciled contract.

## Note

Implementation was staged (not committed) at closeout time; the closeout commit follows per the archive skill step 5.
