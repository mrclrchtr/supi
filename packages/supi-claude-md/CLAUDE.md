# supi-claude-md

CLAUDE.md/AGENTS.md maintenance skills for the pi coding agent.

## Architecture

This package is skills-only in behavior. Its thin extension registers bundled skills through `resources_discover`; it does not inject instruction files, register tools, or expose settings.

Runtime instruction-file surfacing is owned by `@mrclrchtr/supi-code-intelligence`: `code_orientation` with a directory focus surfaces applicable `CLAUDE.md`/`AGENTS.md` files as part of explicit orientation.

## Key files

- `src/claude-md.ts`: resource-discovery-only extension entry point
- `src/extension.ts`: package extension export
- `skills/claude-md-improver`: bulk audit and scoring workflow for CLAUDE.md files
- `skills/claude-md-revision`: targeted session-capture additions to CLAUDE.md/AGENTS.md

## Skills

Two skills are shipped under `skills/`:

- `claude-md-improver`: bulk audit and scoring of CLAUDE.md files across the repo. Includes SuPi-aware baseline review: compares CLAUDE.md sections against the context already delivered by `supi-code-intelligence` (workspace module graph and directory instruction-file orientation), then flags redundant sections or compressible overlap
- `claude-md-revision`: targeted session-capture additions to CLAUDE.md

Both skills share a set of reference files (`references/quality-criteria.md`, `references/templates.md`, `references/update-guidelines.md`). The revision skill duplicates these for self-containment. **When editing one copy, keep the other in sync**; `__tests__/unit/skill-references-sync.test.ts` enforces this.

## Gotchas

- Do not reintroduce automatic `tool_result` instruction injection here. ADR 0013 moved instruction-file surfacing into explicit `code_orientation` directory focus.
- This package intentionally has no `/supi-settings` section. `code-intelligence.instructionFileNames` config belongs to `supi-code-intelligence`.
- The extension entry point remains necessary even though the package is skills-only in behavior, because SuPi resources self-register via `resources_discover` rather than static `pi.skills` manifest entries.
