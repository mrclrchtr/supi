## Context

`supi-review` runs code reviews in an isolated subprocess and injects results as a custom message via `pi.sendMessage()`. The TUI renders findings through a registered custom renderer that reads from `message.details`. The `content` field — what the LLM sees in its context — currently contains only a terse summary like `"3 findings • mostly correct"`.

Pi's `CustomMessageComponent` skips the default `content` rendering entirely when a custom renderer is registered, so `content` and the renderer serve different consumers with no duplication: `content` → agent context, renderer → TUI display.

## Goals / Non-Goals

**Goals:**
- Agent always sees the full structured review result with numbered findings
- User can instruct the agent to fix specific findings by number (e.g. "fix #2 and #3")
- Optional auto-fix triggers the agent to fix all findings automatically after review
- Auto-fix preference is configurable per-invocation and as a persistent default
- Non-interactive path supports the same toggle

**Non-Goals:**
- Priority-based filtering for auto-fix (fix only majors/criticals) — can be added later
- Changing the TUI renderer — it already works well with `details`
- Changing the reviewer subprocess or prompt format

## Decisions

### 1. Rich content formatting

The `content` field will contain a markdown representation of the review result with numbered findings:

```markdown
## Code Review Result

Verdict: mostly correct (confidence: 85%)

### Findings

#1 [major] Missing null check
   src/foo.ts:42-45
   The value could be undefined when…

#2 [minor] Unused import
   src/bar.ts:3
   `lodash` is imported but never used…

Overall: The patch is mostly correct with two issues worth addressing.
```

**Rationale:** Markdown is the most natural format for the LLM to parse. Numbered findings enable the user to reference them by `#N`. File paths and line ranges give the agent enough context to act.

For non-success results (failed, canceled, timeout), `content` will contain the same terse summary as today since there are no findings to enumerate.

**Alternative considered:** Putting JSON in `content`. Rejected — markdown is more token-efficient and natural for LLM conversation context.

### 2. Auto-fix via `sendUserMessage` (Option B)

When auto-fix is enabled, after `pi.sendMessage()` injects the review result, the extension calls:

```ts
pi.sendUserMessage("Fix all findings from the review above.");
```

This is issued only when `result.kind === "success"` and there are findings to fix. No follow-up is sent for clean reviews, failures, cancellations, or timeouts.

**Rationale:** `sendUserMessage` sends an actual user message that always triggers a turn. The agent gets a clear instruction to act on, rather than having to infer intent from a custom message type. It cleanly separates the review data (custom message) from the action request (user message).

**Alternative considered:** Using `triggerTurn: true` on `sendMessage`. Rejected — custom messages are context, not instructions. The agent would need prompt-level guidance to know what to do with it, which is brittle.

### 3. Interactive UI: auto-fix selector after depth

A third selection step in the interactive flow, shown after the depth selector. Two options: "Yes — fix all findings" / "No — review only". The selection is pre-populated from the persisted `autoFix` setting.

**Rationale:** Placing it last means the user confirms intent right before the review runs. Pre-selecting from the setting reduces friction for users who always want the same behavior.

### 4. Non-interactive: `--auto-fix` / `--no-auto-fix` flags

The argument parser accepts optional `--auto-fix` and `--no-auto-fix` flags. When neither is specified, the persisted setting value is used. When both are specified, the last one wins.

```text
/supi-review uncommitted --auto-fix
/supi-review base-branch main --depth deep --no-auto-fix
```

### 5. Setting: `autoFix` (default: `false`)

A new boolean setting in the `review` config section. Stored as `true`/`false` in the supi config JSON. Displayed in `/supi-settings` as "Auto-Fix After Review" with cycle values `on`/`off`.

**Rationale:** Default `false` keeps the current non-intrusive behavior. Users opt in explicitly.

## Risks / Trade-offs

- **[Risk] Auto-fix on large reviews may be expensive** → Acceptable since the user explicitly opts in per-invocation or via setting. No silent cost surprise.
- **[Risk] `sendUserMessage` appears as a user message in transcript** → This is actually desirable — it makes the auto-fix intent visible in the session history. The user can see exactly what triggered the agent.
- **[Risk] Content size in LLM context** → Reviews with many findings produce larger `content` strings. This is bounded by the reviewer's output (typically 5-15 findings) and is much smaller than the diffs that generated them.
