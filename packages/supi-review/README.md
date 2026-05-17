# @mrclrchtr/supi-review

Structured code review for the [pi coding agent](https://github.com/earendil-works/pi).

## Install

```bash
pi install npm:@mrclrchtr/supi-review
```

> **🧪 Beta package** — not included in the `@mrclrchtr/supi` meta-package.
> Install directly when you need structured code reviews.

## What it adds

This extension registers `/supi-review`, which launches an in-process managed child session to review code.

Reviews are driven by a **review brief** — a structured description of what changed, why, and what the reviewer should focus on. Two modes are available:

- **Dynamic review** — you provide a summary of what changed, the intended outcome, and focus areas. The system assembles a review brief and shows you the full prompt for editing and approval before running.
- **Standard review** — pick a predefined review profile (general, security, or API & maintainability). The system generates a brief from the profile and shows the full prompt for editing and approval before running.

Review results are emitted as a `supi-review` custom message that includes the review brief context alongside the verdict and findings. Optional auto-fix mode can send a follow-up user message to fix the findings.

## Review flow

```text
/supi-review
    ↓
select review mode (dynamic / standard)
    ↓
select review target (uncommitted / base-branch / commit / custom)
    ↓
build review brief
    (dynamic: from summary + intent + focus)
    (standard: from profile)
    ↓
edit and approve the full review prompt
    ↓
create child reviewer session
    ↓
submit_review tool returns structured findings
    ↓
render supi-review message with brief + findings
```

## Configuration

If your install surface includes `/supi-settings` (for example when also installing the `@mrclrchtr/supi` meta-package), this package contributes review settings there.

## Architecture

```text
src/
├── briefs.ts              review brief construction and prompt assembly
├── profiles.ts            starter standard review profiles (general, security, api-maintainability)
├── review.ts              command registration and orchestration
├── runner.ts              managed child-session execution
├── runner-types.ts        reviewer invocation and progress types
├── target-resolution.ts   git-backed target hydration
├── prompts.ts             target preamble and diff formatting
├── git.ts                 git helpers for diffs, commits, and branches
├── progress-widget.ts     live TUI progress overlay
├── renderer.ts            custom message renderer
├── settings.ts            review model + behavior settings
├── types.ts               shared result, brief, and target types
├── format-content.ts      plain-text review content formatting
├── ui.ts                  TUI selection, input, and approval steps
└── extension.ts           package entrypoint
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
