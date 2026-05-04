# supi-review

## Reviewer in-process session design

- The reviewer runs as an in-process managed child session via `createAgentSession()` with `SessionManager.inMemory()`.
- The `submit_review` custom tool is registered via `customTools` on the session, storing the validated result in a closure variable. The tool uses TypeBox schema matching `ReviewOutputEvent` and sets `terminate: true`.
- Session tools are restricted to `read, grep, find, ls, submit_review`. Extensions, skills, themes, prompt templates, and context files are all disabled via `DefaultResourceLoader` options.
- The reviewer session uses `DefaultResourceLoader` with `appendSystemPrompt` containing the review instructions. No `--print` or CLI args are used.
- Model resolution: `resolveReviewerModel()` splits the canonical model ID (`provider/model-id`) and calls `ModelRegistry.find(provider, modelId)` to obtain a `Model<any>` object for the session.
- Live progress is shown via `ReviewProgressWidget` (extends `Container` with `CancellableLoader`). The widget updates in real-time from `session.subscribe()` events — tool starts/ends, turn counts, and token stats.
- Graceful timeout: soft limit triggers `session.steer("Time limit reached…")`, then 3 grace turns before `session.abort()`.
- Cancellation: `signal.addEventListener("abort")` wires to `session.abort()`, returning `kind: "canceled"`.
- `ReviewerInvocation` type uses `model: Model<any> | undefined` (resolved model object, not string). No `onSessionStart` callback.
- `ReviewResult` types: no `warning`, `stdout`, or `stderr` fields. Timeout result has `partialOutput` for final assistant text on abort.