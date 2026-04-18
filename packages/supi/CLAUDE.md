# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi/`.

## Scope

`@mrclrchtr/supi` is the published meta-package bundling the full SuPi stack.

## Key responsibilities

- re-export workspace extensions through local wrapper entrypoints:
  - `aliases.ts`
  - `ask-user.ts`
  - `bash-timeout.ts`
  - `lsp.ts`
  - `skill-shortcut.ts`
- expose bundled prompt templates from `prompts/`
- expose bundled skills from `skills/`

## Packaging gotchas

- `pi.extensions`, `pi.prompts`, and `pi.skills` entries are package-relative paths.
- Keep small local wrapper `.ts` files in this package so published installs do not depend on nested workspace `node_modules` layout.
- `workspace:*` dependencies are intentional; pnpm replaces them with concrete versions during publish.

## Prompt templates

- Templates live in `prompts/*.md` and are invoked as `/name` in pi.
- Only `description:` frontmatter is supported; Claude-specific keys like `allowed-tools` are ignored by pi.
- Current template: `prompts/revise-claude-md.md`

## Skills

- Skills live in `skills/<name>/SKILL.md`.
- Registration comes from `pi.skills: ["./skills"]` in `package.json`.
- Naming rules are strict and silent on failure:
  - lowercase + hyphens only
  - max 64 chars
  - directory name must match skill name
  - no leading, trailing, or consecutive hyphens
  - `description:` frontmatter is required
- Progressive disclosure matters:
  - `description` is always loaded
  - `SKILL.md` loads on invocation
  - `references/*.md` load on demand
- Keep `SKILL.md` focused on guidance and pointers; put copy-paste material in `references/`.
