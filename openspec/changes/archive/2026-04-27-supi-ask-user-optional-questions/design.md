## Context

`supi-ask-user` currently supports `choice`, `multichoice`, `yesno`, and `text` questions bundled into a single questionnaire. Every question is implicitly mandatory: the user must answer every field before `Submit` is enabled. This creates a blocking modal experience that works well for explicit decisions but feels interrogative during exploration.

The package already has a well-structured flow engine (`flow.ts`), schema validation (`schema.ts`), and rich UI rendering (`ui-rich-render.ts`, `ui-rich-render-editor.ts`). The changes are additive: we extend the schema, normalize partial answers, and add UI affordances for skipping and chaining.

## Goals / Non-Goals

**Goals:**
- Allow individual questions to be marked `required: false` (default `true`).
- Return partial answers to the extension when the user submits without answering optional questions.
- Provide a first-class `Skip` action that returns an empty/partial result without canceling the interaction.
- Support chained questionnaires where an extension can emit a follow-up questionnaire based on prior partial answers.
- Keep backward compatibility: existing questionnaires without `required` behave exactly as before.

**Non-Goals:**
- Rewriting the TUI component system in pi core.
- Supporting server-sent questionnaires (RPC mode) — interactive only.
- True non-blocking widgets (out of scope for this package; needs pi core changes).

## Decisions

### Optional questions use a `required` field per question
- **Why**: JSON Schema and HTML forms both use `required` as an array of field names, but pi’s `ask_user` tool uses a flat array of questions. Adding `required?: boolean` (default `true`) to each question object is the most ergonomic fit.
- **Alternative considered**: A top-level `required: string[]` listing question IDs. Rejected because questions don’t currently have stable IDs and it adds indirection.

### Partial answers are represented as `undefined` for unanswered optional questions
- **Why**: The existing `ask_user` result shape is `Record<string, unknown>`. For optional questions, the key is still present but the value is `undefined`. This lets extensions distinguish "user skipped this" from "this question wasn't asked."
- **Alternative considered**: Omitting the key entirely. Rejected because it breaks extensions that destructure expecting the key.

### Skip action returns `{ skip: true }` alongside partial answers
- **Why**: The existing result types are `string`, `string[]`, `boolean`, `boolean[]`, or `Record<string, unknown>`. A skip is semantically different from canceling (Esc) or submitting empty answers. We add a discriminator field `skip?: true` to the result envelope so the extension can branch cleanly.
- **Note**: This is a contract change for the `ask_user` tool return value. We need to document it in the tool schema.

### Chained questionnaires reuse the same `ask_user` tool call
- **Why**: The simplest way to chain is for the extension to receive partial results, decide on follow-ups, and emit a second `ask_user` call in the same handler or in a follow-up turn. No new protocol is needed.
- **Alternative considered**: A native "next page" concept inside `supi-ask-user`. Rejected because it complicates the state machine and is unnecessary for the expected use case (2-3 questions max per chain).

## Risks / Trade-offs

- **[Risk]** Partial answers could confuse extensions that assume all keys have values.
  → **Mitigation**: Default `required: true` preserves existing behavior. Only extensions that explicitly opt in to optional questions are affected.
- **[Risk]** Skip vs Cancel semantics may confuse users.
  → **Mitigation**: UI labels clearly distinguish "Skip questionnaire" (submit partial/nothing) from "Cancel" (abort, no result). Skip only appears when at least one question is optional or the questionnaire has `allowSkip: true`.
- **[Risk]** Chaining could create long interaction loops.
  → **Mitigation**: Document guidance in the skill: prefer 1-2 follow-up questions max. The extension author controls the chain length.

## Migration Plan

No migration needed. This is a fully backward-compatible additive change. Existing `ask_user` calls without `required` behave identically.

## Open Questions

- Should we add a global `allowSkip: boolean` at the questionnaire level, or infer it from the presence of optional questions?
- Should `text` questions support `placeholder` hints to nudge freeform exploration?
