## Brainstorming Outcome
**Problem**: Package READMEs across `packages/*` vary in depth and structure. We need a package-by-package documentation pass that inspects each package's real capabilities and rewrites each `README.md` so an install-minded user can quickly understand what the package adds.

**Recommended approach**: Do a capability-first normalization pass across all package READMEs. For each package, inspect the actual package surface (`package.json`, `src/extension.ts`, `src/api.ts`, settings/commands/tools) and rewrite the README in a consistent, user-oriented shape.

**Why**: This keeps the docs grounded in the code, removes vague or AI-flavored copy, and makes package-to-package reading more consistent without forcing boilerplate everywhere.

**Chosen style**: Normalize the READMEs. The main reader is a user deciding whether to install the package and what they get from it. Prefer plain language and concrete feature descriptions. Avoid AI floskels.

**Constraints / non-goals**:
- Docs only; no package behavior changes.
- Include all packages under `packages/*`, including `packages/supi-test-utils`.
- Keep each README focused on install surface, commands/tools/settings, and important limits or developer notes when relevant.
- Normalize structure, but omit empty filler sections.

**Open questions**: None.
**Ticket**: TNDM-BBW9PP