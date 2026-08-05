<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-claude-md">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-claude-md/assets/social-preview.png" alt="SuPi Claude.md" width="100%">
  </a>
</div>

# @mrclrchtr/supi-claude-md

CLAUDE.md/AGENTS.md maintenance skills for the [pi coding agent](https://github.com/earendil-works/pi).

> Runtime instruction-file surfacing is owned by `@mrclrchtr/supi-code-intelligence`: use `code_orientation(focus="packages/...")` to see directory-local instruction files during orientation.

## Install

```bash
pi install npm:@mrclrchtr/supi-claude-md
```

This is a **beta** package. Install individually.

For local development:

```bash
pi install ./packages/supi-claude-md
```

## What you get

This package exposes two skills through `resources_discover`:

- `claude-md-improver` — audit and improve `CLAUDE.md` files across a repo
- `claude-md-revision` — update `CLAUDE.md` or `AGENTS.md` with durable project learnings from a session

The extension is intentionally thin: it only registers the bundled skills. It does not inject context, register tools, or add settings.

## Instruction-file surfacing

Automatic tool-result injection was removed. Directory-local instruction files are now surfaced by `supi-code-intelligence` during explicit directory orientation:

```text
code_orientation(focus="packages/my-package")
```

That keeps arbitrary tool output clean while still making local instructions available when the agent intentionally orients into a package or directory.

## Source

- `src/claude-md.ts` — thin skill resource-discovery extension
- `skills/claude-md-improver` — bulk audit workflow
- `skills/claude-md-revision` — targeted revision workflow
