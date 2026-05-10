# @mrclrchtr/supi-review

Structured code review for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

## What it adds

This extension registers `/supi-review`, which launches an in-process managed child session to review:

- uncommitted changes
- a base-branch diff
- a specific commit
- custom review instructions

Review results are emitted as a `supi-review` custom message. Optional auto-fix mode can send a follow-up user message to fix the findings.

## Review flow

```text
/supi-review
    ↓
select preset + auto-fix mode
    ↓
collect diff / commit / custom target
    ↓
create child reviewer session
    ↓
submit_review tool returns structured findings
    ↓
render supi-review message
```

## Configuration

If your install surface includes `/supi-settings` (for example via `@mrclrchtr/supi`), this package contributes review settings there.

## Architecture

```text
src/
├── review.ts             command registration and orchestration
├── runner.ts             managed child-session execution
├── target-resolution.ts  git-backed target hydration
├── prompts.ts            review prompt generation
├── git.ts                git helpers for diffs, commits, and branches
├── progress-widget.ts    live TUI progress overlay
├── renderer.ts           custom message renderer
├── settings.ts           review model + behavior settings
└── types.ts              shared result and target types
```

## Requirements

- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`
- `@mrclrchtr/supi-core`

## Development

```bash
pnpm vitest run packages/supi-review/
pnpm exec tsc --noEmit -p packages/supi-review/tsconfig.json
pnpm exec biome check packages/supi-review/
```

## License

MIT
