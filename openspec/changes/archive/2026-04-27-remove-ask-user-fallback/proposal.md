## Why

The `supi-ask-user` extension currently maintains two parallel UI paths: a rich overlay built on `ctx.ui.custom()` and a dialog-based fallback using `ctx.ui.select()`/`input()`. Pi's TUI has been stable for a long time and every supported environment provides `custom()`. The fallback path adds ~300 lines of code, ~200 lines of tests, and ongoing maintenance burden for a compatibility surface that is no longer needed.

## What Changes

- **Remove `ui-fallback.ts`** and all fallback-specific logic from `ask-user.ts`. **BREAKING** (removes `runFallbackQuestionnaire` re-export).
- **Remove all fallback test files**: `fallback.test.ts`, `fallback-comments.test.ts`, `fallback-review.test.ts`.
- **Update `ask-user.ts` `driveQuestionnaire`**: when `custom()` is unavailable, return an explicit error result instructing the agent not to use `ask_user` in non-interactive or degraded UI sessions.
- **Update `ask-user.ts` `ExtensionUi` interface**: drop `select` and `input` requirements; only `custom` is needed.
- **Rewrite `__tests__/execute.test.ts`**: replace `fallbackCtx` with a `richCtx` helper that mocks `custom()`, and remove the test that specifically validates fallback discuss answers.
- **Update comments** in `flow.ts` and `format.ts` to no longer reference the fallback path.
- **Update `openspec/specs/ask-user/spec.md`**: remove the "Fallback SHALL provide reduced compatibility" requirement.

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- `ask-user`: Remove the fallback-mode requirement. The extension no longer provides a degraded dialog path when `ctx.ui.custom()` is unavailable; instead it returns an explicit error.

## Impact

- `@mrclrchtr/supi-ask-user` package — `ask-user.ts`, `flow.ts`, `format.ts`, test files.
- `openspec/specs/ask-user/spec.md` — remove fallback requirement.
- No downstream packages import `runFallbackQuestionnaire`.
