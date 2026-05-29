# Redesign `supi-review` triage, audit hints, and result contract

## Problem

`@mrclrchtr/supi-review` finds useful issues, but repeated reruns still uncover net-new problems. The current output contract is also too coarse:

- `priority` (`P0..P3`) is too vague for cleanup, docs, test-gap, and maintainer-facing items
- fix guidance is buried in prose instead of structured for follow-up work
- verdict consistency depends on the reviewer model instead of deterministic host rules
- the reviewer prompt does not explicitly audit the change shapes that most often produce follow-up misses (public-name sweeps, cross-layer threading, widened enums/operations, deletion/orphan cleanup)

## Approved approach

Perform a clean pre-release redesign of `supi-review` around a new **review item** contract.

The redesign keeps the current **single main reviewer pass** and recent **fixed follow-up options**, but changes what the reviewer submits and how the host interprets it.

### Core decisions

- Keep **one main review pass by default**
- Do **not** preserve backward compatibility with the current `priority`-based schema
- Replace `priority` with structured triage fields
- Keep cleanup, docs, test-gap, and maintainer concerns as first-class review items
- Keep the top-level verdict **binary**:
  - `PATCH IS CORRECT`
  - `PATCH HAS ISSUES`
- Derive the verdict in host code from normalized review items instead of trusting model output
- Add deterministic, shape-triggered audit hints instead of a mandatory second reviewer pass
- Add structured `suggested_fix` and `verification_hint` fields to every reported item

## New review item contract

Each review item will include:

- `title`
- `body`
- `category`
  - `correctness`
  - `security`
  - `performance`
  - `api`
  - `test-gap`
  - `docs`
  - `cleanup`
  - `maintainer`
- `impact`
  - `low | medium | high`
- `effort`
  - `low | medium | high`
- `recommended_action`
  - `must-fix | should-fix | consider`
- `confidence_score`
- `suggested_fix`
- `verification_hint`
- `code_location?`

The review result keeps a short overall explanation, but the host computes the final verdict from normalized items:

- any `must-fix` item => `PATCH HAS ISSUES`
- otherwise => `PATCH IS CORRECT`

## Deterministic audit hints

Before the reviewer runs, the host will derive a small set of audit hints from the snapshot shape and thread them into the reviewer packet/prompt.

### Audit families

1. **Public-surface / rename / merge audit**
   - Trigger when the change renames, removes, or merges public names/tools/schemas
   - Reviewer must sweep stale references across source, tests, docs, user-facing strings, and debug/status lists

2. **Cross-layer propagation audit**
   - Trigger when the change spans provider/runtime/orchestration/use-case/renderer/test layers
   - Reviewer must verify each handoff and check for at least one end-to-end expectation

3. **Enum / operation / schema widening audit**
   - Trigger when the change adds or expands enums, operations, schemas, or routing branches
   - Reviewer must audit validation, unavailable/error paths, switch coverage, aliases, and negative tests

4. **Cleanup / deletion / orphan audit**
   - Trigger when files are deleted or consumers are removed
   - Reviewer must audit orphan files, dead imports/re-exports, stale comments, and outdated expectations

These audits are deterministic host hints, not a second full model pass.

## Host-side normalization and ordering

After `submit_review`, the host will normalize the review items before rendering or handoff.

Normalization responsibilities:

- validate the new schema
- derive the binary verdict from `recommended_action`
- compute summary counts by action and category
- sort items by:
  1. `recommended_action`
  2. `impact`
  3. `effort` (lower first)
  4. `confidence_score`
- preserve structured fix guidance for follow-up work

This normalization layer is the single source of truth for verdict, ordering, and summary counts.

## Reviewer prompt expectations

The reviewer prompt in `src/tool/review-runner.ts` should be updated so category-specific items are judged consistently.

Examples:

- `test-gap` items only count when changed behavior or risk is insufficiently verified
- `docs` items only count when touched behavior or public surface is now misleading or stale
- `cleanup` items only count for concrete leftovers introduced by the patch
- `maintainer` items only count when the patch introduces a real future maintenance trap in touched code

This keeps cleanup/docs/test-gap items visible while reducing vague or low-value commentary.

## Visible output and hidden follow-up

The rendered review should show the richer triage shape for each item:

- category
- recommended action
- impact / effort
- confidence
- location
- suggested fix
- verification hint

The hidden follow-up handoff should keep the current fixed options:

- Fix all
- Fix selected
- Verify findings
- Skip

Urgency will come from normalized `recommended_action` values rather than the old priority field.

## File map

### Create

- `packages/supi-review/src/review-result.ts`
  - host-side normalization, verdict derivation, item ordering, summary counts
- `packages/supi-review/src/target/audit-hints.ts`
  - deterministic audit-hint derivation from snapshot shape/diff metadata
- `packages/supi-review/__tests__/unit/review-result.test.ts`
  - normalization, verdict, and ordering tests
- `packages/supi-review/__tests__/unit/audit-hints.test.ts`
  - deterministic audit-trigger coverage

### Modify

- `packages/supi-review/src/tool/schemas.ts`
  - replace the current finding schema with the new review-item schema
- `packages/supi-review/src/types.ts`
  - replace `priority`-based result types with the new structured triage types
- `packages/supi-review/src/tool/review-runner.ts`
  - update reviewer prompt guidance and reviewer submission expectations
- `packages/supi-review/src/target/packet.ts`
  - include audit hints in the compact reviewer packet
- `packages/supi-review/src/review.ts`
  - normalize results before emitting/rendering/handoff and update follow-up urgency logic
- `packages/supi-review/src/ui/format-content.ts`
  - render the new triage shape in LLM-visible review output
- `packages/supi-review/src/ui/renderer.ts`
  - render the new triage shape in the TUI review output
- `packages/supi-review/__tests__/unit/runner.test.ts`
  - reviewer prompt / submission behavior under the new contract
- `packages/supi-review/__tests__/unit/review-command.test.ts`
  - normalized result flow, derived verdict, and follow-up behavior
- `packages/supi-review/__tests__/unit/renderer.test.ts`
  - visible rendering for mixed categories and actions
- `packages/supi-review/__tests__/unit/packet.test.ts`
  - audit-hint packet integration
- `packages/supi-review/README.md`
  - document the new review-item triage model and actionable output
- `packages/supi-review/CLAUDE.md`
  - document the new contract, normalization rules, and deterministic audits

## Non-goals

- no always-on second reviewer/model pass
- no multi-reviewer orchestration
- no settings surface for review policies in this ticket
- no numeric blended value score
- no backward-compatible `priority` bridge layer
- no automatic code fixing or implementation of review suggestions

## Verification strategy

The implementation plan should verify:

- schema/type coverage for the new contract
- deterministic verdict derivation and item ordering
- deterministic audit-hint triggers
- reviewer prompt/packet integration
- hidden follow-up messaging based on normalized actions
- TUI and plain-text rendering of mixed review items
- full `packages/supi-review` tests, source+test typechecks, and Biome
