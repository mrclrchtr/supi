## 1. Package Setup

- [ ] 1.1 Create `packages/supi-review/` directory with `package.json` (workspace package, no build step). Include `*.md` in the `files` array so `review-prompt.md` is included in the published package.
- [ ] 1.2 Create stub `packages/supi-review/index.ts` exporting the default extension factory.
- [ ] 1.3 Create `packages/supi-review/tsconfig.json` extending the workspace config.
- [ ] 1.4 Create thin wrapper `packages/supi/review.ts` that re-exports from `packages/supi-review/`.
- [ ] 1.5 Add `@mrclrchtr/supi-review` dependency to `packages/supi/package.json`.
- [ ] 1.6 Add `packages/supi-review/index.ts` to root `package.json` `pi.extensions`.
- [ ] 1.7 Add `./review.ts` to `packages/supi/package.json` `pi.extensions`.

## 2. Git Target Resolution

- [ ] 2.1 Create `packages/supi-review/git.ts` with `getMergeBase(repoPath, branch)`.
- [ ] 2.2 Implement `getDiff(repoPath, baseSha)` for base-branch mode.
- [ ] 2.3 Implement `getUncommittedDiff(repoPath)` combining staged, unstaged, and untracked files.
- [ ] 2.4 Implement `getRecentCommits(repoPath, limit)` returning `{sha, subject}` array.
- [ ] 2.5 Implement `getCommitShow(repoPath, sha)` for commit review mode.
- [ ] 2.6 Implement `getLocalBranches(repoPath)` returning sorted branch list with default branch first.
- [ ] 2.7 Add diff truncation to `maxDiffBytes` (default 100KB) using middle truncation: keep head and tail, insert `[... truncated N bytes ...]`, and include a truncation note.

## 3. Review Prompt Construction

- [ ] 3.1 Create `packages/supi-review/review-prompt.md` with the reviewer rubric and JSON output schema.
- [ ] 3.2 Create `packages/supi-review/prompts.ts` with `buildReviewPrompt(target, diff, options)`.
- [ ] 3.3 Implement prompt variants: base-branch, uncommitted, commit, custom.
- [ ] 3.4 Include target metadata (branch name, commit SHA, file stats) in the prompt preamble.
- [ ] 3.5 Append the Codex-style `ReviewOutputEvent` JSON schema exactly as specified in the spec.

## 4. Subprocess Reviewer Runner

- [ ] 4.1 Create `packages/supi-review/runner.ts` with `runReviewer(prompt, model, cwd, signal)`.
- [ ] 4.2 Implement `getPiInvocation()` to detect runtime and build the subprocess command.
- [ ] 4.3 Spawn `pi --mode json -p --no-session --tools read,grep,find,ls --model <model> <prompt>` when a model is resolved; omit `--model` when no model is resolved. The `-p` flag ensures non-interactive exit after completion (matches the official pi subagent example).
- [ ] 4.4 Parse JSONL events from stdout and collect the final assistant message from the last assistant `message_end` event. Normalize the message `content` from an array of parts (`{ type: "text", text: ... }`) to a single plain string before passing to `parseReviewOutput()`.
- [ ] 4.5 Handle subprocess spawn errors, non-zero exits, stderr, and missing assistant output as graceful failed review results.
- [ ] 4.6 Listen to the `AbortSignal` and explicitly terminate the child process: first `proc.kill("SIGTERM")`, then `proc.kill("SIGKILL")` after a 5-second grace period if the process is still alive.
- [ ] 4.7 Add reviewer timeout handling with a default of **300000ms** (5 minutes) and expose it through internal runner options.
- [ ] 4.8 Preserve stdout/stderr excerpts in failed review details for renderer/debug visibility.

## 5. Read-only Subprocess Tool Policy

- [ ] 5.1 Ensure the subprocess tool allowlist contains only `read`, `grep`, `find`, and `ls`.
- [ ] 5.2 Ensure `bash`, `write`, and `edit` are not included in v1 subprocess tools.
- [ ] 5.3 Document in `review-prompt.md` that the reviewer may inspect files with read-only tools but must not attempt edits.
- [ ] 5.4 Add tests that assert the runner constructs the read-only tool allowlist.

## 6. Structured Output Parsing

- [ ] 6.1 Define TypeScript interfaces for `ReviewOutputEvent`, `ReviewFinding`, `ReviewCodeLocation`, `ReviewLineRange`.
- [ ] 6.2 Implement `parseReviewOutput(text)` that attempts full JSON parse first.
- [ ] 6.3 Implement fallback: extract first `{...}` substring and attempt JSON parse.
- [ ] 6.4 Implement final fallback: wrap entire text in `ReviewOutputEvent` with `overall_explanation` set to the text.
- [ ] 6.5 Validate parsed output (check required fields, clamp `priority` to 0-3, ensure confidence scores are numbers from 0.0 to 1.0).

## 7. Custom Transcript Renderer

- [ ] 7.1 Create `packages/supi-review/renderer.ts` with `registerReviewRenderer(pi)`.
- [ ] 7.2 Implement renderer showing: review target banner, findings list (priority, title, location, body), overall verdict.
- [ ] 7.3 Use theme tokens (`theme.fg`, `theme.bg`) for consistent styling.
- [ ] 7.4 Support collapsed (summary) and expanded (full findings) views.
- [ ] 7.5 Handle empty findings gracefully (show "No issues found" with explanation).
- [ ] 7.6 Handle failed, canceled, and timed-out review results gracefully.

## 8. Settings Registry Integration

- [ ] 8.1 Create `packages/supi-review/settings.ts` registering `reviewFastModel`, `reviewDeepModel`, and `maxDiffBytes`.
- [ ] 8.2 Use `@mrclrchtr/supi-core` `registerConfigSettings()` API (not raw `registerSettings()`).
- [ ] 8.3 Implement `loadReviewSettings(cwd)` returning merged global + project config via `loadSupiConfig("review", cwd, REVIEW_DEFAULTS)`.

```ts
const REVIEW_DEFAULTS = {
  reviewFastModel: "",
  reviewDeepModel: "",
  maxDiffBytes: 100_000,
};
```
- [ ] 8.4 Add settings persistence callbacks (`persistChange`) for `supi-settings` UI.

## 9. Command and UI Wiring

- [ ] 9.1 Register `/review` command in `index.ts`.
- [ ] 9.2 Implement non-interactive argument parsing for `base-branch <branch>`, `uncommitted`, `commit <sha>`, and `custom -- <instructions...>` with optional `--depth inherit|fast|deep`. The `--depth` flag (if present) must be consumed **before** the `--` sentinel; everything after `--` (or all remaining args if `--` is omitted) becomes the custom instructions.
- [ ] 9.3 Implement interactive preset selector using `ctx.ui.custom()` + `SelectList` + `DynamicBorder`.
- [ ] 9.4 Implement depth selector (Inherit, Fast, Deep) showing configured model names inline.
- [ ] 9.5 Implement branch picker for base-branch mode.
- [ ] 9.6 Implement commit picker for commit mode.
- [ ] 9.7 Implement custom instructions prompt using `ctx.ui.input()` or `ctx.ui.editor()`.
- [ ] 9.8 Wire the full flow: command -> preset/args -> depth -> git resolution -> runner -> parse -> inject custom message.
- [ ] 9.9 Show a `BorderedLoader` or status widget while the reviewer subprocess runs.
- [ ] 9.10 Return clear usage errors in non-interactive mode when arguments are missing or invalid.

## 10. Meta-Package and Manifest Updates

- [ ] 10.1 Ensure `packages/supi/review.ts` correctly imports and calls the factory.
- [ ] ~~10.2 Update root `package.json` scripts so `pnpm typecheck` includes the new package.~~ (Not needed — the existing `for p in packages/*/tsconfig.json` loop auto-discovers new packages.)
- [ ] 10.3 Run `pnpm install` to update lockfile for new workspace dependency.
- [ ] 10.4 Verify `/review` appears in `pi.getCommands()` after `/reload`.

## 11. Testing and Validation

- [ ] 11.1 Add unit tests for `git.ts` functions using a temporary git repository.
- [ ] 11.2 Add unit tests for `parseReviewOutput()` covering valid JSON, substring JSON, invalid JSON, and plain-text fallback.
- [ ] 11.3 Add unit tests for runner command construction, including JSON mode flags, model omission, and read-only tool allowlist.
- [ ] 11.4 Add unit tests for non-interactive argument parsing and usage errors.
- [ ] 11.5 Add unit tests for subprocess failure handling (spawn failure, non-zero exit, timeout, abort, missing assistant output).
- [ ] 11.6 Add integration test for the full flow mocking the subprocess runner.
- [ ] 11.7 Run `pnpm typecheck` and `pnpm biome` on the new package.
- [ ] 11.8 Manual test: run `/review` in a real pi session and verify findings render correctly.
- [ ] 11.9 Verify settings appear in `/supi-settings` and persist correctly.
