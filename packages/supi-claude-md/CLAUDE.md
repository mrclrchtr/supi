# supi-claude-md

## Architecture

This package is skills-only in behavior. Its thin extension registers bundled skills through `resources_discover`; it does not inject instruction files, register tools, or expose settings.

Runtime instruction-file surfacing is owned by `@mrclrchtr/supi-code-intelligence`: `code_orientation` with a directory focus surfaces applicable `CLAUDE.md`/`AGENTS.md` files as part of explicit orientation.

## Skills

- `claude-md-improver`: bulk audit and scoring of CLAUDE.md files. Compares instructions with the delivered workspace overview and non-instruction facts from routine Orientation; flags redundant inventories while preserving human-only reasoning.
- `claude-md-revision`: targeted session-capture additions to CLAUDE.md

Both skills share a set of reference files (`references/quality-criteria.md`, `references/templates.md`, `references/update-guidelines.md`). The revision skill duplicates these for self-containment. **When editing one copy, keep the other in sync**; `__tests__/unit/skill-references-sync.test.ts` enforces this.

## Gotchas

- Do not reintroduce automatic `tool_result` instruction injection here. ADR 0013 moved instruction-file surfacing into explicit `code_orientation` directory focus.
- This package intentionally has no `/supi-settings` section. `code-intelligence.instructionFileNames` config belongs to `supi-code-intelligence`.
- The extension entry point remains necessary even though the package is skills-only in behavior, because SuPi resources self-register via `resources_discover` rather than static `pi.skills` manifest entries.
