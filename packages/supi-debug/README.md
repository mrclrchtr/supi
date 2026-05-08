# @mrclrchtr/supi-debug

Session-local debug event inspection for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Install

```bash
pi install npm:@mrclrchtr/supi-debug
```

## What it adds

This extension provides three surfaces for inspecting recent SuPi debug events:

- `supi_debug` tool — agent-callable query API
- `/supi-debug` command — TUI report for humans
- shared settings integration — enable/disable, access level, max events, notify level when your install surface includes `/supi-settings` (for example via `@mrclrchtr/supi`)

By default the agent sees sanitized event data. Raw event access requires explicit opt-in.

## Query filters

Both the command and the tool support filtering by:

- `source`
- `level`
- `category`
- `limit`

## Architecture

```text
src/
├── debug.ts     extension wiring, settings, tool, and command registration
├── format.ts    event formatting and serialization
├── renderer.ts  custom message renderer for debug reports
└── index.ts     package entrypoint
```

## Requirements

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`
- `typebox`
- `@mrclrchtr/supi-core`

## Development

```bash
pnpm vitest run packages/supi-debug/
pnpm exec tsc --noEmit -p packages/supi-debug/tsconfig.json
pnpm exec biome check packages/supi-debug/
```

## License

MIT
