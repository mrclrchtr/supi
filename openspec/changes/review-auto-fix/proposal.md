## Why

After a review completes, the agent only sees a terse summary string (e.g. "3 findings • mostly correct") — not the actual findings, file paths, or descriptions. This makes it impossible for the user to reference specific findings or ask the agent to act on them. Additionally, there is no way to have the agent automatically fix review findings without manual follow-up prompting.

## What Changes

- Enrich the `content` field of the injected `supi-review` custom message with a full markdown representation of the review result, including numbered findings with file paths, line ranges, priorities, and bodies. The agent always sees this; the TUI continues using the existing custom renderer (which reads from `details`) so there is no visual duplication.
- Add an auto-fix toggle to the interactive flow as a third selection step after target and depth, pre-selected from a persisted setting.
- When auto-fix is enabled, send a `pi.sendUserMessage("Fix all findings from the review above.")` after the review message to trigger an automatic agent turn.
- Add `--auto-fix` / `--no-auto-fix` flags to the non-interactive argument grammar, falling back to the persisted setting when neither is specified.
- Register `autoFix` as a new boolean setting in the review settings section.

## Capabilities

### New Capabilities

_None — all changes extend the existing `supi-review` capability._

### Modified Capabilities

- `supi-review`: Adds rich agent-visible content, auto-fix toggle (interactive + non-interactive), and a new `autoFix` setting.

## Impact

- **Code**: `packages/supi-review/` — `index.ts` (content formatting, sendUserMessage call), `ui.ts` (auto-fix selector), `args.ts` (--auto-fix flag parsing), `settings.ts` (new setting), `types.ts` (ReviewSettings update).
- **APIs**: No external API changes. The `sendMessage` content field changes from a terse string to rich markdown, which is additive for the LLM context.
- **Dependencies**: No new dependencies. Uses existing `pi.sendUserMessage()` API.
- **Settings**: New `autoFix` key in the `review` config section (default: `false`).
