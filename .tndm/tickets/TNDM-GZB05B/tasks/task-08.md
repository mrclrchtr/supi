# Task 8: Update CLAUDE.md with new domain entry point conventions

Document the new domain entry point structure for supi-core in `CLAUDE.md`.

### Changes to make
In CLAUDE.md, under the "Packaging conventions" section or a new "supi-core entry points" section:

1. Add a brief description of the domain decomposition: supi-core exposes 11 domain subpath exports plus a convenience barrel at `./api`.
2. List the entry points with a short description of what each contains:
   - `@mrclrchtr/supi-core/config` — config loading, config-settings helpers
   - `@mrclrchtr/supi-core/context` — context messages, providers, tags
   - `@mrclrchtr/supi-core/debug` — debug event recording
   - `@mrclrchtr/supi-core/path` — file/URI path utilities
   - `@mrclrchtr/supi-core/project` — project root discovery
   - `@mrclrchtr/supi-core/session` — session utilities, registries
   - `@mrclrchtr/supi-core/settings` — settings registry (lightweight)
   - `@mrclrchtr/supi-core/settings-ui` — settings TUI components (imports pi-tui, **heavy**)
   - `@mrclrchtr/supi-core/terminal` — terminal formatting/signals
   - `@mrclrchtr/supi-core/tool-framework` — tool registration
   - `@mrclrchtr/supi-core/types` — shared types (CodeLocation, CodePosition)
   - `@mrclrchtr/supi-core/api` — convenience barrel (re-exports all of above)
3. Add a note: Prefer domain entry points when importing from supi-core; use `./api` only when you need symbols from 3+ domains.
4. Update the typecheck command if it still references old patterns.

### Verification
- `pnpm biome:ai` must pass
- Read the section to confirm it's clear and complete
