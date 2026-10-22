# supi-context

Observability for how a pi session occupies and approaches its context-window limit.

## Concepts and surfaces

- **Context Pressure Snapshot** — the agent-facing, constant-shape capacity reading. `context_report({})` defaults to this concise mode; it intentionally excludes diagnostic inventories.
- **Context Usage Report** — the human-facing diagnostic report. `/supi-context` is registered only in TUI mode and appends a custom entry, so it stays visible in the transcript without entering LLM context.

`mode: "full"` on `context_report` returns compact diagnostic JSON. It uses Pi's normal output limits only to detect oversized output, then writes the complete valid JSON to a temporary file and returns a valid JSON envelope.

## Shared capacity model

Both surfaces and diagnostic analysis share `usedTokens`, effective `reserveTokens`, `headroomTokens`, usage/pressure percentages, and factual `compacted` state. Attribution categories must never contain capacity-only values.

Use `@mrclrchtr/supi-core/report` for shared themed report primitives.

## Gotchas

- Context category estimates for user messages and tool results must use Pi’s `estimateTokens()`; text-only counting omits image cost and diverges from fallback snapshots.
- `supi-context` caches `event.systemPromptOptions` from `before_agent_start`; when those options are missing or incomplete, `prompt-inference.ts` backfills context files and skills from the current system prompt.
- System-prompt breakdown separates native instruction files (`AGENTS.md`, `CLAUDE.md`, etc.) from other context files.
- Auto-compaction settings are read when analysis runs. Its reserve is effective only while auto-compaction is enabled.
- The human command must use `pi.appendEntry()` plus `pi.registerEntryRenderer()`, never `pi.sendMessage()` or a custom-message renderer.
- The `context_report` tool reads `agentToolEnabled` at extension load time (`process.cwd()`). Toggling it in `/supi-settings` requires `/reload` or a restart.
