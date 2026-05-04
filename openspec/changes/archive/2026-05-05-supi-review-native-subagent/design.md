## Context

supi-review currently spawns a reviewer sub-agent inside a detached tmux session. The review runner:
1. Writes a temp `submit_review` tool extension (TypeBox-validated JSON output)
2. Writes a temp runner `.mjs` script that spawns `pi --print` inside tmux
3. Polls filesystem for `-exit.json` to detect completion
4. Reads structured review output from temp JSON file
5. Cancels via `tmux send-keys C-c` → `tmux kill-session`

pi 0.72 provides `createAgentSession()` — a first-class SDK API for creating managed child sessions in-process. Two third-party extensions (tintinweb/pi-subagents, nicobailon/pi-subagents) use it for sub-agent orchestration. The API provides live event streaming (`session.subscribe()`), graceful steering (`session.steer()`), structured message access (`session.messages`), and clean abort (`session.abort()`).

`--print` mode, which supi-review passes to the tmux subprocess, produces no interactive TUI output. The tmux pane shows nothing — the session name announcement in `onSessionStart` suggests users can attach, but there is nothing to see.

## Goals / Non-Goals

**Goals:**
- Replace tmux spawn with `createAgentSession()` for reviewer execution
- Remove tmp file machinery (`-tool.ts`, `-runner.mjs`, `-exit.json`, `-pane.log`)
- Add live progress widget showing reviewer tool activity (tool names, turn count, tokens)
- Replace SIGINT cancel with graceful steering + abort
- Maintain identical user-facing behavior: same presets, depth selector, auto-fix, renderer, structured output format
- Preserve the `submit_review` tool concept but implement it as a tool on the agent session rather than a temp file extension

**Non-Goals:**
- Generic sub-agent framework (this change keeps supi-review's single-purpose reviewer)
- Conversation viewer overlay (can be added later if needed)
- Background/parallel review execution (stays foreground-only with loader)
- Persisting reviewer sessions for later resume (in-memory SessionManager, discarded after review)

## Decisions

### Decision 1: Use `createAgentSession` with in-memory SessionManager

**Rationale:** Reviews are ephemeral — the session is discarded after the review completes. `SessionManager.inMemory()` avoids creating session files on disk. The reviewer doesn't need to persist state across restarts.

**Alternative considered:** Persisted session files. Rejected because reviews are one-shot tasks; there is no resume use case for a review session.

### Decision 2: Keep `submit_review` as a tool on the agent session, but remove temp file

Currently `submit_review` is a temp `.ts` extension that writes to a known temp file path. With `createAgentSession`, the tool can be registered via `customTools` option. Instead of writing to a temp file, the tool's execute handler stores the result in a closure variable accessible to the parent after the session emits `agent_end`.

```typescript
let reviewOutput: ReviewOutputEvent | undefined;

const submitReviewTool: ToolDefinition = {
  name: "submit_review",
  label: "Submit Review",
  description: "Submit the final structured review result.",
  parameters: Type.Object({ /* same schema */ }),
  execute: async (_toolCallId, args) => {
    reviewOutput = args as ReviewOutputEvent;
    return {
      content: [{ type: "text", text: "Review submitted successfully." }],
      details: args,
      terminate: true,
    };
  },
};

const { session } = await createAgentSession({
  tools: ["read", "grep", "find", "ls"],
  customTools: [submitReviewTool],
  // ...
});

await session.prompt(prompt);
await waitForAgentEnd(session); // resolves on "agent_end" event
// reviewOutput is populated if submit_review was called before agent_end
```

**Alternative considered:** Drop `submit_review` entirely and parse structured JSON from the final assistant response text. Rejected because TypeBox validation inside the tool guarantees schema-correct output before it reaches the parent — the current spec's `Scenario: Tool submission with invalid arguments` behavior is preserved.

### Decision 3: Live widget via `session.subscribe()` event stream

The runner subscribes to the reviewer's `AgentSessionEvent` stream via `session.subscribe()`. It maps `tool_execution_start`, `tool_execution_end`, and `turn_end` events into a progress state object exposed to the parent command handler. The handler feeds this state into a live widget that replaces the current `BorderedLoader`:

```
⠹ Reviewing… · ⟳3 · 3 tool uses · 12.4k tokens
  ⎿  reading auth.ts, searching for patterns…
```

The widget is managed by the review command handler, not the runner, keeping the runner focused on execution.

**Alternative considered:** Full ConversationViewer overlay like tintinweb. Rejected as out of scope — the live widget gives enough feedback for a review workflow. The full viewer can be added later.

### Decision 4: Graceful timeout via `session.steer()` → `session.abort()`

Instead of `SIGINT` + kill delay, the reviewer gets a steering message at the soft timeout, then grace turns before hard abort:

```
Timeout at 20 min → session.steer("Time limit reached. Wrap up and submit your review now.")
                 → 3 grace turns (configurable)
                 → session.abort() if still running
```

This lets the reviewer produce partial results instead of dying mid-thought.

**Alternative considered:** Same SIGINT approach without tmux (process.kill). Rejected because steering gives the reviewer a chance to produce a useful partial result.

### Decision 5: Remove `ReviewerInvocation.onSessionStart`

The tmux session name announcement (`"Review running in tmux session supi-review-xxx"`) is replaced by the live widget. The `onSessionStart` callback is removed from the invocation interface.

### Decision 6: Model resolution stays in the parent

The review command handler resolves the model string (from settings or the parent session). It splits the canonical ID (`provider/model-id`) and calls `ModelRegistry.find(provider, modelId)` to obtain a `Model<any>` object, then passes it to `createAgentSession({ model })`. The runner no longer constructs `--model` CLI args.

## Risks / Trade-offs

- **Risk:** `createAgentSession` may have different memory/performance characteristics than a separate process. → **Mitigation:** In-memory sessions are lightweight. The reviewer uses the same model API as the parent, not a separate process with its own memory. Monitor memory during testing.
- **Risk:** Tool execution errors in the sub-session could surface differently than in a separate process. → **Mitigation:** `session.bindExtensions({ onError })` captures extension errors. Tool failures surface through the same `AgentSessionEvent` stream as in the parent.
- **Risk:** The reviewer could theoretically access parent session state through shared memory. → **Mitigation:** `createAgentSession` with `SessionManager.inMemory()` creates an isolated session. The reviewer's tools are restricted to `read,grep,find,ls` — it cannot write files or access the parent's session.
- **Trade-off:** Lost tmux attachability. → The `--print` mode already had no visible output. The live widget provides better observability than an empty tmux pane.

## Open Questions

- Should the grace turn count (currently 3) be configurable via settings? (Defer — start with hardcoded 3, add setting later if needed.)
- Should the live widget show per-file tool activity (e.g., "reading auth.ts") or just tool names (e.g., "reading")? (Start with tool names only — file paths come from tool args which aren't directly available in `tool_execution_start` events.)
