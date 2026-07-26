# supi-context

Observability for how a pi session occupies and approaches its context-window limit.

## Scope

- `@mrclrchtr/supi-context/extension` → `src/extension.ts`
- `@mrclrchtr/supi-context/api` → `src/api.ts`

## Concepts and surfaces

- **Context Pressure Snapshot** — the agent-facing, constant-shape capacity reading. `supi_context({})` defaults to this concise mode; it intentionally excludes diagnostic inventories.
- **Context Usage Report** — the human-facing diagnostic report. `/supi-context` is registered only in TUI mode and appends a custom entry, so it stays visible in the transcript without entering LLM context.

`mode: "full"` on `supi_context` returns compact diagnostic JSON. It uses Pi's normal output limits only to detect oversized output, then writes the complete valid JSON to a temporary file and returns a valid JSON envelope.

## Architecture

```
src/
├── context.ts          # Surface registration and cached system-prompt options
├── capacity.ts         # Shared Active Context Limit, Headroom, and snapshot analysis
├── analysis.ts         # Diagnostic attribution (system, messages, tools, extensions)
├── config.ts           # agentToolEnabled configuration
├── entry-renderer.ts   # TUI renderer for durable human-report entries
├── settings-registration.ts
├── format*.ts          # Context Usage Report sections and helpers
├── report-component.ts # Width-aware diagnostic report component
├── snapshot-component.ts # Width-safe concise snapshot component
├── prompt-inference.ts # Fallback recovery of prompt inputs
├── tool/
│   ├── guidance.ts
│   ├── output.ts       # Compact full JSON or temp-file envelope
│   └── render.ts
└── utils.ts
__tests__/unit/
├── capacity.test.ts
├── context.test.ts
├── analysis*.test.ts
├── format.test.ts
└── render.test.ts
```

The analysis layer shares capacity fields with both surfaces: `usedTokens`, effective `reserveTokens`, `headroomTokens`, usage/pressure percentages, and factual `compacted` state. Attribution categories never contain capacity-only values.

Rendering uses `@mrclrchtr/supi-core/report` helpers for shared themed report primitives.

## Gotchas

- `supi-context` caches `event.systemPromptOptions` from `before_agent_start`; when those options are missing or incomplete, `prompt-inference.ts` backfills context files and skills from the current system prompt.
- System-prompt breakdown separates native instruction files (`AGENTS.md`, `CLAUDE.md`, etc.) from other context files.
- Auto-compaction settings are read when analysis runs. Its reserve is effective only while auto-compaction is enabled.
- The human command must use `pi.appendEntry()` plus `pi.registerEntryRenderer()`, never `pi.sendMessage()` or a custom-message renderer.
- The `supi_context` tool reads `agentToolEnabled` at extension load time (`process.cwd()`). Toggling it in `/supi-settings` requires `/reload` or a restart.
