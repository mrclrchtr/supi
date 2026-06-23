# Overview

## Problem
The code-intelligence surface now has `code_resolve`, `code_find`, `code_graph`, `code_health`, and the refactor plan/apply pair active, but it still lacks `code_context`, the planned Phase 2 task-focused successor to `code_brief`. Agents can orient with `code_brief`, but they still have to stitch together follow-up tools manually instead of asking for one context bundle shaped around the task at hand.

## Scope check
Keep this ticket to one coherent result: implement and activate `code_context` inside `packages/supi-code-intelligence`. Do **not** bundle unrelated polish such as the `code_affected` target-name fallback or the `code_health` zero-count diagnostic summary issue here. Those are independent follow-ups and should stay separate.

## Assumptions
- `code_context` ships additively in this phase; `code_brief` remains registered as the compatibility/orientation tool.
- The existing `CodeContextParameters` schema in `packages/supi-code-intelligence/src/workflow/schemas.ts` remains the public schema source of truth.
- First-wave `code_context` may be best-effort per section, but it must be explicit about omitted or unavailable sections instead of inventing context.

## Approach
Add a public `code_context` tool that accepts `task`, `targetId`, `scope`, `budget`, `include`, and `maxResults`, then compose the existing code-intelligence layers behind it:

- reuse `code_resolve`/target-store handles for precise targeting
- reuse current brief/orientation logic when `task` is omitted or as the lead section for task-focused bundles
- reuse relation/search/diagnostic services for references, callees, docs/tests, and diagnostics where evidence already exists
- return dedicated structured context details instead of overloading `brief` details
- keep docs, prompt guidance, and workflow notes aligned with the additive rollout

## File map

### Public tool surface and routing
- `packages/supi-code-intelligence/src/intent/types.ts` — add `code_context` to the active tool-name union while keeping `code_brief`.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — register the `code_context` tool, reuse `CodeContextParameters`, and add prompt guidance.
- `packages/supi-code-intelligence/src/tool/execute-context.ts` — new public executor for targetId expansion, validation, routing, and use-case handoff.
- `packages/supi-code-intelligence/src/analysis/routing/planner.ts` — route `code_context` with the same semantic/structural preference model used for orientation-style tools.

### Context orchestration and rendering
- `packages/supi-code-intelligence/src/use-case/types.ts` — add context input/deps/result contracts.
- `packages/supi-code-intelligence/src/use-case/generate-context.ts` — new orchestration module for task-focused bundles.
- `packages/supi-code-intelligence/src/presentation/markdown/context.ts` — new markdown renderer for context bundles.
- `packages/supi-code-intelligence/src/types.ts` — add dedicated structured details for `code_context`.
- `packages/supi-code-intelligence/src/presentation/markdown/resolve.ts` — update follow-up suggestions if active-surface wording should now mention `code_context`.

### Tests and docs
- `packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts` — new focused tool contract/behavior tests.
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — assert registration and active-surface expectations.
- `packages/supi-code-intelligence/__tests__/unit/planner-routing.test.ts` — assert routing for `code_context`.
- `packages/supi-code-intelligence/__tests__/unit/details-metadata.test.ts` — assert structured details metadata for `code_context`.
- `packages/supi-code-intelligence/__tests__/unit/code-resolve-tool.test.ts` — update wording tests if `code_context` becomes a valid follow-up suggestion.
- `packages/supi-code-intelligence/README.md` — mark `code_context` active and describe additive rollout.
- `packages/supi-code-intelligence/CLAUDE.md` — update maintainer guidance for the active `code_context` surface.
- `packages/supi-code-intelligence/src/workflow/names.ts` and `packages/supi-code-intelligence/src/workflow/surface.ts` — update roadmap/phase notes to match the new active state.

## Behavior requirements
- `code_context` accepts `targetId` from `code_resolve` and uses it as the preferred anchor.
- Omitting `task` produces orientation-style output instead of an error.
- `include` limits the rendered sections; unrequested sections stay out of the result.
- Requested but unsupported/empty sections are reported honestly.
- `budget` and `maxResults` cap output deterministically.
- `code_brief` stays available during this phase.
- Docs, tests, and prompt guidance all describe `code_context` as active and additive.

## Verification strategy
- RED/GREEN tests for registration, routing, and schema contract first.
- RED/GREEN tests for task-focused context bundle behavior and structured details next.
- Final package verification with Vitest, TypeScript build, Biome, and a live `code_resolve` → `code_context` smoke test after `/reload`.
