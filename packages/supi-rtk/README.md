# @mrclrchtr/supi-rtk

Transparent RTK-backed bash rewriting for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-rtk
```

> **🧪 Beta package** — not included in the `@mrclrchtr/supi` meta-package.
> Install directly when you want RTK-backed bash rewriting.

## What it adds

This extension wraps the `bash` tool and tries to rewrite commands through the [RTK CLI](https://github.com/joshcho/RTK) before execution.

The goal is lower token usage for repetitive shell commands while preserving the original command when rewriting is unsafe or unavailable.

## Rewrite flow

```text
bash tool call
    ↓
guards.ts checks known lossy collisions
    ↓
rewrite.ts runs `rtk rewrite <command>`
    ↓
rewritten command or original fallback executes
    ↓
tracking.ts records rewrite/fallback stats
```

## Safety guards

Known lossy rewrites are passed through without RTK mediation, including current Biome and ripgrep collision cases.

## Requirements

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `@mrclrchtr/supi-core`
- RTK CLI available on `PATH`

## Development

```bash
pnpm vitest run packages/supi-rtk/
pnpm exec tsc --noEmit -p packages/supi-rtk/tsconfig.json
pnpm exec biome check packages/supi-rtk/
```

## License

MIT
