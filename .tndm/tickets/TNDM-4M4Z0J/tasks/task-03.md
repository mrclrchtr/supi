# Task 3: Shrink ask_user schema text and top-level tool guidance

## Goal
Cut the single biggest tool-definition hotspot by simplifying the `ask_user` tool description and the per-field schema descriptions.

## Changes
- Update `packages/supi-ask-user/__tests__/unit/guidance.test.ts` first so it still protects the key `ask_user` contract after the wording change.
- In `packages/supi-ask-user/src/tool/guidance.ts`, keep the essentials: blocking decision, small focused form, and single active form constraint.
- In `packages/supi-ask-user/src/schema.ts`, shorten repetitive field descriptions such as ids, labels, required flags, selection semantics, and form-level options.

## Constraints
- Keep enough wording that `choice`, `text`, `allowOther`, `allowPartialSubmit`, and `allowDiscuss` remain understandable from the schema alone.
- Do not change schema shape or runtime validation behavior.
