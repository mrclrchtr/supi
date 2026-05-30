# Overview

## Problem
`packages/supi-review/` currently decides whether to add extra reviewer instruction text by matching changed file paths and diff text in host code (`src/target/audit-hints.ts`). That conditional prompt construction is brittle and spreads review intent across host heuristics instead of the brief-synthesis step that already interprets session context and snapshot shape.

## Approved direction
Move instruction-block selection into brief synthesis.

The host should keep a fixed catalog of review instruction blocks, but it should stop inferring applicability from file-path or diff-text heuristics. Instead, the brief synthesizer will choose zero or more catalog block IDs and return them as part of the structured brief. The review packet builder will simply render the selected blocks into the prompt.

## Scope and non-goals

### In scope
- replace host-side audit-hint selection logic with brief-selected instruction block IDs
- keep the current four instruction families for this pass
- extend the synthesized brief schema and types to carry selected block IDs
- rename packet/reviewer wording from `audit hints` to clearer mandatory review instructions
- update tests and package docs to match the new architecture

### Non-goals
- redesign the four instruction families themselves
- change the review result contract or reviewer submission schema
- add a host fallback that reintroduces conditional block selection
- change snapshot tool behavior or review target selection flow

## Design

### Catalog ownership
Create a host-owned catalog module for the current four instruction families. Each entry should expose a stable ID, title, and instruction text. The host remains responsible for the canonical wording; the brief only selects IDs from the allowed catalog.

### Brief contract
Extend the synthesized brief shape with a `reviewInstructionBlockIds` field. The brief synthesizer prompt should list the allowed block IDs and the criteria for selecting them:
- select only blocks supported by the supplied session/snapshot evidence
- omit blocks when uncertain
- prefer precision over coverage
- return only IDs from the provided catalog

### Packet building
`buildReviewPacket()` should stop deriving hints from the snapshot. Instead, it should resolve the brief-selected IDs against the catalog and render a dedicated section for mandatory review instructions. Packet construction should become data-driven: brief in, catalog lookup, prompt out.

### Reviewer prompt wording
The reviewer system prompt should no longer refer to `audit hints`. It should refer to mandatory review instructions from the prompt packet and keep the same behavioral contract: if instructions are present, the reviewer must explicitly cover them before submitting.

## File map
- `packages/supi-review/src/types.ts` — extend `SynthesizedReviewBrief`; add the instruction-block ID type if it is shared
- `packages/supi-review/src/tool/schemas.ts` — validate the new brief field
- `packages/supi-review/src/history/synthesize.ts` — teach the brief synthesis prompt about the instruction-block catalog and output field
- `packages/supi-review/src/tool/brief-runner.ts` — accept and return the expanded brief payload
- `packages/supi-review/src/target/audit-hints.ts` — replace with a catalog-oriented module (likely renamed) that exports the fixed instruction blocks instead of deriving them from snapshot heuristics
- `packages/supi-review/src/target/packet.ts` — render selected instruction blocks from the brief; remove snapshot-driven selection logic
- `packages/supi-review/src/tool/review-runner.ts` — update reviewer system-prompt wording to match the new section name/contract
- `packages/supi-review/__tests__/unit/brief-runner.test.ts` — cover the expanded brief payload
- `packages/supi-review/__tests__/unit/packet.test.ts` — assert packet rendering from selected block IDs and absence of snapshot-driven selection coupling
- `packages/supi-review/__tests__/unit/runner.test.ts` — update reviewer prompt expectations
- `packages/supi-review/README.md` — describe brief-selected instruction blocks instead of deterministic audit-hint derivation
- `packages/supi-review/CLAUDE.md` — update architecture notes and gotchas to match the new flow

## Verification strategy
- red-green-refactor for schema/packet/prompt behavior covered by unit tests
- package-scoped verification for `packages/supi-review/` with Vitest, Biome, and TypeScript
- confirm docs and prompt wording consistently use the new terminology and no longer claim host-deterministic audit-hint selection

## Constraints
- keep the solution simple and data-driven
- do not add a second selection mechanism or fallback path
- preserve the current four instruction families in this pass
- keep packet generation compact; do not reintroduce bulk diffs into the prompt
