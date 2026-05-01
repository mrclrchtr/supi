## Why

pi lacks a structured code review command, forcing users to manually prompt the agent to review diffs. OpenAI Codex solves this with `/review` — a dedicated reviewer that reads selected changes and reports prioritized, actionable findings without touching the working tree. SuPi should provide the same capability so users can catch issues before committing or opening pull requests.

## What Changes

- Add a new `packages/supi-review/` workspace package with the `/review` extension.
- Register a `/review` command that opens a TUI preset selector (base branch, uncommitted changes, specific commit, custom instructions).
- Add a two-step depth selector (`Inherit`, `Fast`, `Deep`) to choose the review model.
- Compute git targets (merge-base, diff, commit list) in the extension; feed a rich review prompt to a dedicated subprocess reviewer.
- Run the reviewer in an isolated `pi --mode json --no-session` subprocess with `read`, `grep`, `find`, and `ls` tools.
- Parse structured review output (`ReviewOutputEvent` JSON schema) and render findings as a custom `supi-review` message in the transcript.
- Add `reviewFastModel`, `reviewDeepModel`, and `maxDiffBytes` settings to the SuPi settings registry.
- Wire the new package into the `packages/supi/` meta-package.

## Capabilities

### New Capabilities
- `supi-review`: Structured code review via `/review` command with preset selection, dedicated subprocess reviewer, and custom transcript rendering.

### Modified Capabilities
- *(none)* — this change consumes existing settings-registry and ask-user capabilities but does not alter their requirements.

## Impact

- **New package**: `packages/supi-review/` (TypeScript, no runtime build step).
- **Meta-package**: `packages/supi/` gains a new re-export wrapper `review.ts`.
- **Root manifest**: `package.json` `pi.extensions` updated to include the new extension.
- **Settings**: New `review` section in `~/.pi/agent/supi/config.json` and `.pi/supi/config.json`.
- **Dependencies**: Reuses existing `@mrclrchtr/supi-core` config utilities; no new npm dependencies.
- **Transcript**: Custom `supi-review` message type; extensions that handle all custom message types may need awareness.
