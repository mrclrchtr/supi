# CLAUDE.md

## Scope

`@mrclrchtr/supi-agents` owns Agent Profile discovery, validation, resource policy, and the fixed child capability catalogue. It is an installable PI extension; Agent Run lifecycle mechanics belong to `@mrclrchtr/supi-agent-runtime`.

## Guidelines

- Keep profile sources self-contained: package, global, and trusted-project directories replace one another by Profile ID and never merge fields or prompt assets.
- Preserve invalid higher-precedence profiles as unavailable diagnostics; never silently fall back to a lower-precedence definition.
- Keep the catalogue immutable until the next `session_start`/reload and cap it at 32 sorted IDs.
- Treat project profile discovery as trust-gated policy, not as a second confirmation flow.
- Keep prompt selection separate from global/project instruction scopes. Exclude ambient extensions, skills, prompt templates, themes, PI `SYSTEM.md`, and `APPEND_SYSTEM.md` resources.
- Keep unrestricted `bash`, `edit`, and `write` mutation-capable. New capabilities default to mutation-capable until explicitly classified.
- Resolve explicit profile models against the containing session's authenticated scoped-model policy before any Agent Run starts.
- Use the existing headless Code Intelligence profile only; do not load the full interactive extension into children.
- Keep diagnostics bounded and omit profile prompt contents, credentials, and raw filesystem errors.
- Do not add a settings section for profiles; profile policy belongs in self-contained Profile Directories.

## Verification

Use package-focused Vitest and TypeScript checks while iterating, then run `pnpm verify:ai` before completion.
