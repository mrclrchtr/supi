# supi-review

Automated code review via an in-process managed child session. Reviews are driven by a **review brief** assembled from user-provided inputs or a predefined profile.

## Commands

```bash
pnpm vitest run packages/supi-review/
pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json
pnpm exec biome check packages/supi-review/
```

## Architecture

The `/supi-review` command follows a **brief-driven** pipeline:

1. **Select mode** (dynamic or standard)
2. **Select target** (uncommitted, base-branch, commit, custom)
3. **Build brief** — from dynamic inputs (summary/intent/focus) or a profile
4. **Approve brief** — the full prompt is shown via editor for editing and confirmation
5. **Run reviewer** — child session executes with the approved prompt
6. **Render results** — brief context + verdict + findings

### Review brief

The `ReviewBrief` type (in `types.ts`) captures the review request independently from the git target. It includes the mode, title, summary, intent, focus, optional profile ID, and the final assembled prompt. The brief flows through the runner and is attached to the result for rendering.

### Profiles

Three starter profiles are defined in `profiles.ts`:
- `general` — standard correctness, security, performance, maintainability
- `security` — focused on injection risks, auth, secrets, data validation
- `api-maintainability` — focused on API design, breaking changes, consistency

Each profile has optional system-prompt guidance injected into the reviewer child session.

### Source module map

| Module | Purpose |
|--------|---------|
| `types.ts` | ReviewResult, ReviewTarget, ReviewBrief, ReviewMode, ReviewProfile |
| `profiles.ts` | Fixed starter set of standard review profiles |
| `briefs.ts` | Dynamic/standard brief construction and prompt assembly |
| `prompts.ts` | Target preamble and diff formatting |
| `review.ts` | Command registration, orchestration, model resolution |
| `ui.ts` | TUI selection lists, input collection, brief editing |
| `runner.ts` | Child-session creation, progress tracking, timeout handling |
| `runner-types.ts` | ReviewerInvocation and ReviewProgress interfaces |
| `renderer.ts` | Custom message rendering with brief context |
| `format-content.ts` | Plain-text format for LLM content of review messages |
| `settings.ts` | Review model, diff size, and auto-fix settings |
| `git.ts` | Git diff/commit/branch helpers |
| `target-resolution.ts` | Lazy target hydration from git |

### Reviewer in-process session design

- The reviewer runs as an in-process managed child session via `createAgentSession()` with `SessionManager.inMemory()`.
- The `submit_review` custom tool is registered via `customTools` on the session, storing the validated result in a closure variable. The tool uses TypeBox schema matching `ReviewOutputEvent` and sets `terminate: true`.
- Session tools are restricted to `read, grep, find, ls, submit_review`. Skills, themes, and prompt templates are disabled, but **extensions and context files (e.g. CLAUDE.md) are enabled** so the reviewer inherits the same project guidance as the main agent.
- The reviewer session uses `DefaultResourceLoader` with `appendSystemPrompt` containing the review instructions (from `buildReviewerSystemPrompt()` plus any profile-specific guidance). No `--print` or CLI args are used.
- All review targets carry an optional `changedFiles` list (git filenames) rendered in the preamble. This gives the reviewer immediate scope context even for custom reviews where no diff is present.
- Model resolution: `resolveReviewerModel()` splits the canonical model ID (`provider/model-id`) and calls `ModelRegistry.find(provider, modelId)` to obtain a `Model<any>` object for the session.
- Live progress is shown via `ReviewProgressWidget` (extends `Container` with `CancellableLoader`). The widget updates in real-time from `session.subscribe()` events — tool starts/ends, turn counts, and token stats.
- Graceful timeout: soft limit triggers `session.steer("Time limit reached…")`, then 3 grace turns before `session.abort()`.
- Cancellation: `signal.addEventListener("abort")` wires to `session.abort()`, returning `kind: "canceled"`.
- `ReviewerInvocation` type uses `model: Model<any> | undefined` (resolved model object, not string). No `onSessionStart` callback.
- `ReviewResult` types: no `warning`, `stdout`, or `stderr` fields. Timeout result has `partialOutput` for final assistant text on abort. Success and failure results carry the optional `brief` field with the review brief metadata.
- Emits `pi.events.emit("supi:working:start", { source: "supi-review" })` before the review begins and `supi:working:end` in the finish callback (covers success, failed, canceled, timeout) so the tab spinner stays active while the reviewer is running.
