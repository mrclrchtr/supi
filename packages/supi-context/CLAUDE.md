# supi-context

Detailed context usage report for pi via `/supi-context`.

## Commands

```bash
pnpm vitest run packages/supi-context/
pnpm exec tsc --noEmit -p packages/supi-context/tsconfig.json
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
```

On `/supi-context`, analyzes the current system prompt and calculates token usage breakdowns. Results are sent as a `supi-context` custom message with a TUI-visible summary in `content` and detailed analysis in `details`.

## Gotchas

- Custom message renderers must explicitly display `warning` for all result states, not just `failed`/`timeout`.
- `display: false` suppresses TUI rendering — `content` holds the visible summary for the agent.
