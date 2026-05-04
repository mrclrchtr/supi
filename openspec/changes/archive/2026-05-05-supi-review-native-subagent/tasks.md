## 1. Core runner rewrite

- [x] 1.1 Create `submit_review` custom tool definition with TypeBox schema matching `ReviewOutputEvent`, storing result in a mutable closure variable
- [x] 1.2 Create `createReviewerSession()` helper that calls `createAgentSession()` with in-memory SessionManager, restricted tools (`read,grep,find,ls`), `DefaultResourceLoader` with extensions/skills/context-files disabled, and the review prompt as `appendSystemPrompt`
- [x] 1.3 Implement `runReviewer()` using `createReviewerSession()`: call `session.prompt(prompt)`, subscribe to events via `session.subscribe()`, wait for `agent_end` event, return `ReviewResult` with stored output or extracted final assistant text. Expose a progress state callback for widget integration.
- [x] 1.4 Implement graceful timeout: soft limit via `session.steer("Wrap up...")`, 3 grace turns tracked via turn counter, hard abort via `session.abort()`
- [x] 1.5 Implement cancellation: wire `signal.addEventListener("abort")` to `session.abort()`, return `kind: "canceled"`
- [x] 1.6 Update `ReviewerInvocation` type: remove `onSessionStart`, add `onToolActivity` and `onProgress` callbacks for widget integration
- [x] 1.7 Remove tmux-specific code: `isTmuxAvailable()`, `tmuxHasSession()`, `tmuxSendInterrupt()`, `tmuxKillSession()`, `resolveSessionName()`, `killSessionIfPresent()`

## 2. Remove temp file machinery

- [x] 2.1 Remove `writeSubmitReviewTool()` — tool is now registered via `customTools` option on session
- [x] 2.2 Remove `writeTmuxRunnerScript()` — no more tmux runner script needed
- [x] 2.3 Remove `generateReviewId()` — no temp file IDs needed
- [x] 2.4 Remove `getTempPaths()` — no temp file paths needed
- [x] 2.5 Remove `readRunnerExitStatus()` — exit status tracked via session events
- [x] 2.6 Keep `buildPiArgs()` but refactor: it no longer builds `--print` args; becomes `buildReviewerSystemPrompt()` that returns the review prompt string for `DefaultResourceLoader.appendSystemPrompt`
- [x] 2.7 Keep `readStructuredOutput()` but refactor: reads from the stored closure variable instead of temp file, falls back to `session.messages` extraction

## 3. Live progress widget

- [x] 3.1 Create `ReviewProgressWidget` component (extends `Container`): animated loader, turn count, tool uses, token count, human-readable activity description
- [x] 3.2 Map `tool_execution_start`/`tool_execution_end` event tool names to human-readable actions ("read" → "reading", "grep" → "searching", etc.)
- [x] 3.3 Wire `session.subscribe()` progress callbacks into widget state updates via `tui.requestRender()`
- [x] 3.4 Replace `BorderedLoader` in `runReviewWithLoader()` with `ReviewProgressWidget`
- [x] 3.5 Handle widget disposal on review completion, cancel, or error

## 4. Update review command wiring

- [x] 4.1 Update `resolveReviewerModel()` — resolve the model string to a `Model<any>` object via `ModelRegistry.find()` and pass it to `createAgentSession()`. Remove `--model` CLI arg construction.
- [x] 4.2 Update `executeReview()` and `runReview()` — pass `ExtensionContext` (for `ctx.modelRegistry`, `ctx.model`, `ctx.getSystemPrompt()`) instead of just `CommandContext`
- [x] 4.3 Remove `onSessionStart` callback usage (tmux session name announcement)
- [x] 4.4 Wire new `ReviewerInvocation` fields into review execution call chain

## 5. Update types and renderer

- [x] 5.1 Remove `warning` field from `ReviewResult` types (was tmux-specific diagnostic guidance)
- [x] 5.2 Add `partialOutput` field to timeout result type for final assistant text on abort
- [x] 5.3 Update `renderFailed()`, `renderTimeout()`, `renderCanceled()` — remove tmux-specific warning text (e.g., "tmux attach -t", "tmux kill-session")
- [x] 5.4 Update error messages in `appendDiagnostics()` — reference session-level diagnostics instead of pane logs

## 6. Tests

- [x] 6.1 Rewrite `__tests__/runner.test.ts`: mock `createAgentSession` instead of tmux spawn, test session creation, tool registration, prompt execution, graceful timeout, cancellation, error handling
- [x] 6.2 Update `__tests__/renderer.test.ts`: remove tmux-specific warning assertions, update error message assertions
- [x] 6.3 Update `__tests__/index.test.ts`: remove tmux-specific warning assertions
- [x] 6.4 Add test for `submit_review` tool registration and result extraction via closure variable
- [x] 6.5 Add test for graceful timeout (steer → grace turns → abort)
- [x] 6.6 Run `pnpm test` on supi-review package and fix failures

## 7. Cleanup

- [x] 7.1 Update `packages/supi-review/CLAUDE.md` — remove tmux design guidance, document createAgentSession approach
- [x] 7.2 Remove `--print` from any remaining arg-building code
- [x] 7.3 Remove `getPiInvocation()` — no longer needed (no external process to spawn)
- [x] 7.4 Run `pnpm verify` to ensure Biome and typecheck pass