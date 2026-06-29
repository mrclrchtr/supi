# supi-context

Detailed context usage report for pi via `/supi-context` and the `supi_context` agent tool.

## Scope

- `@mrclrchtr/supi-context/extension` → `src/extension.ts`
- `@mrclrchtr/supi-context/api` → `src/api.ts`

## Architecture

```
src/
├── context.ts          # Extension entry — registers /supi-context command + supi_context tool
├── config.ts           # Config loading (agentToolEnabled toggle)
├── settings-registration.ts  # /supi-settings registration for the agent tool toggle
├── analysis.ts         # Context token breakdown (system, messages, tools, extensions)
├── format.ts           # Report orchestration
├── format-helpers.ts   # Shared local numeric/category helpers for report rendering
├── format-summary.ts   # Summary, usage bar, category, and composition sections
├── format-sections.ts  # File, skill, guideline, tool, compaction, and provider sections
├── prompt-inference.ts # Model-specific context window detection
├── report-component.ts # Shared width-aware report component for message/tool renderers
├── renderer.ts         # Custom message renderer for TUI display
├── tool/
│   ├── guidance.ts     # Tool description, prompt snippet, and guidelines
│   └── render.ts       # TUI call/result renderer for the agent tool
└── utils.ts            # Token formatting helpers
__tests__/
├── tsconfig.json
└── unit/
    ├── analysis.test.ts
    ├── analysis-edge.test.ts
    ├── format.test.ts
    └── utils.test.ts
```

On `/supi-context`, analyzes the current system prompt and calculates token usage breakdowns. Results are sent as a `supi-context` custom message with a TUI-visible summary in `content` and detailed analysis in `details`.

The `supi_context` agent tool returns the same `ContextAnalysis` data as JSON so the agent can inspect context usage programmatically. Its TUI renderer uses structured `details.analysis` for the collapsed summary and expanded report, so the collapsed view never leaks raw agent-facing JSON. It is gated on the `agentToolEnabled` config flag (default `false`).

Rendering uses the shared `@mrclrchtr/supi-core/report` helpers for common themed report primitives so other SuPi packages can reuse the same header, row, overflow-hint, and wrapped-text behavior.

## Gotchas

- `supi-context` caches `event.systemPromptOptions` from `before_agent_start`; when those options are missing or incomplete, `prompt-inference.ts` backfills `contextFiles` and `skills` from the current system prompt.
- System-prompt breakdown separates native instruction files (`AGENTS.md`, `CLAUDE.md`, etc.) from other `contextFiles`, so changes to pi's context-file loading directly affect the report.
- Custom message renderers must explicitly display `warning` for all result states, not just `failed`/`timeout`.
- The `supi_context` tool reads config at extension load time (`process.cwd()`). Toggling `agentToolEnabled` in `/supi-settings` requires `/reload` or a restart to take effect.
