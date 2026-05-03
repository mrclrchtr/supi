## Why

`supi-ask-user` truncates user-visible content with `"..."` in the tool call header (hard 60-col cap on the comma-separated header list) and applies defensive `truncateToWidth` safety nets throughout the overlay renderer. In a tool where question headers, option labels, descriptions, and answers are critical information for user decision-making, any truncation is information loss — especially the call header in the transcript, which is the user's first-line glance at what the agent asked.

## What Changes

- Remove the `MAX_HEADER_LIST = 60` hard cap from `renderAskUserCall`; let the `Text` component's word wrapping handle overflow naturally
- Remove redundant `truncateToWidth` safety nets in `ui-rich-render.ts` and `ui-rich-inline.ts` where text is already pre-wrapped (addWrapped, markdown rendering, review answers, descriptions)
- Preserve `truncateToWidth` only where the text is NOT pre-wrapped and width guarantees are needed (separator bars, tab bar segments, editor captions)
- Ensure option descriptions, review answers, and preview content render fully without silent truncation

## Capabilities

### Modified Capabilities

- `ask-user`: The rich overlay SHALL NOT silently truncate wrapped content that has already been width-fitted by the renderer. The call header in the transcript SHALL NOT be artificially capped at 60 columns.

## Impact

- `packages/supi-ask-user/render.ts` — remove `MAX_HEADER_LIST`, simplify call header rendering
- `packages/supi-ask-user/ui-rich-render.ts` — remove safety-net `truncateToWidth` calls on already-wrapped lines
- `packages/supi-ask-user/ui-rich-inline.ts` — review inline editor line truncation
- `packages/supi-ask-user/ui-rich-render-editor.ts` — review editor rendering truncation
- `packages/supi-ask-user/__tests__/render.test.ts` — update call header truncation expectations
- No breaking API changes; only rendering output changes
