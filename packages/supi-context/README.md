# @mrclrchtr/supi-context

Detailed context-usage reporting for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-context
```

## What it adds

This extension registers `/supi-context`, which analyzes the current session prompt and reports how context is being spent across:

- system prompt
- conversation messages
- tools
- extension-injected context

The result is rendered as a custom `supi-context` message with a concise visible summary and structured details for the renderer.

## Architecture

```text
src/
├── context.ts          /supi-context command registration
├── analysis.ts         token breakdown calculations
├── format.ts           formatting and bar-chart helpers
├── prompt-inference.ts model-specific context-window detection
├── renderer.ts         custom message renderer
└── utils.ts            shared formatting helpers
```

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`

## Development

```bash
pnpm vitest run packages/supi-context/
pnpm exec tsc --noEmit -p packages/supi-context/tsconfig.json
pnpm exec biome check packages/supi-context/
```

## License

MIT
