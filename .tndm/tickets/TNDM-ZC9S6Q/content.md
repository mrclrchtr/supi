## Overview
Replace `supi-review`'s heuristic session-evidence scoring with a compaction-style history preparation step. The review flow will still resolve the active branch through `buildSessionContext(...)`, but instead of ranking snippets, it will serialize the resolved LLM-visible context into a compact transcript shaped like Pi's compaction input and feed that transcript into the existing brief-synthesis child session with a review-specific prompt.

## File map
- `packages/supi-review/src/history/collect.ts` — replace evidence scoring with deterministic session serialization over resolved session-context messages.
- `packages/supi-review/src/history/synthesize.ts` — accept serialized session history, include it in the prompt, and keep the bounded diff excerpt + optional note.
- `packages/supi-review/src/review.ts` — swap `collectHistoryEvidence(...)` for the new history-preparation call.
- `packages/supi-review/src/types.ts` — remove evidence-specific types/fields that no longer belong in the brief contract.
- `packages/supi-review/__tests__/unit/history-collect.test.ts` — cover the new serializer behavior instead of heuristic ranking.
- `packages/supi-review/__tests__/unit/history-synthesize.test.ts` — assert the prompt now includes serialized session context and still includes diff excerpt/note handling.
- `packages/supi-review/__tests__/unit/review-command.test.ts` — verify the command wires resolved session context through the serializer into synthesis.
- `packages/supi-review/__tests__/unit/brief-runner.test.ts`, `packet.test.ts`, `runner.test.ts`, `renderer.test.ts`, `index.test.ts` — update brief fixtures for the simplified brief type if `evidenceCount` is removed.
- `packages/supi-review/README.md` and `packages/supi-review/CLAUDE.md` — document the new brief-input path.

## Design decisions
- Use the same overall approach as Pi compaction: summarize the conversation as a whole from a serialized transcript, not a ranked subset of snippets.
- Keep the implementation local to `supi-review` rather than binding it to Pi internals beyond `buildSessionContext(...)`; mirror the compaction-style transcript shape directly in package code.
- Preserve the current snapshot-first flow, bounded diff excerpt, optional user note, dedicated brief-synthesis child session, and reviewer phase.
- Remove heuristic changed-path token matching, intent-word scoring, and evidence-count metadata.

## Verification strategy
1. Rewrite the collector tests first so they fail against the old heuristic collector and define the expected serialized transcript format.
2. Update the synthesis prompt tests and command-wiring tests before changing implementation so the new data flow is locked in.
3. Finish with the full `packages/supi-review` test suite, package typechecks, and Biome.

## Notes
The serializer should operate on the resolved `SessionContext` messages returned by `buildSessionContext(...)`, so compaction and branch-summary entries continue to appear exactly as the LLM would see them. Keep the serialized transcript bounded so the brief synthesizer stays predictable on long sessions.