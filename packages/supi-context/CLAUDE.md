# supi-context

Detailed context usage report for pi via `/supi-context`.

## Scope

- `@mrclrchtr/supi-context/extension` → `src/extension.ts`
- `@mrclrchtr/supi-context/api` → `src/api.ts`

## Commands

```bash
pnpm vitest run packages/supi-context/
pnpm exec tsc --noEmit -p packages/supi-context/tsconfig.json
pnpm exec tsc --noEmit -p packages/supi-context/__tests__/tsconfig.json
pnpm exec biome check packages/supi-context/
```

## Architecture

```
src/
├── context.ts          # Extension entry — registers /supi-context command
├── analysis.ts         # Context token breakdown (system, messages, tools, extensions)
├── format.ts           # Token formatting + bar chart generation
├── prompt-inference.ts # Model-specific context window detection
├── renderer.ts         # Custom message renderer for TUI display
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

## Gotchas

- `supi-context` caches `event.systemPromptOptions` from `before_agent_start`; when those options are missing or incomplete, `prompt-inference.ts` backfills `contextFiles` and `skills` from the current system prompt.
- System-prompt breakdown separates native instruction files (`AGENTS.md`, `CLAUDE.md`, etc.) from other `contextFiles`, so changes to pi's context-file loading directly affect the report.
- Custom message renderers must explicitly display `warning` for all result states, not just `failed`/`timeout`.
