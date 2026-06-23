# Task 4: Document coordinate target semantics and scope precedence

**Description:**

Update durable docs and agent-facing tool guidance so agents understand the new coordinate workflow and do not overload `scope`.

The docs should make these semantics explicit:

- `code_context` accepts either `targetId` or `file + line + character` for precise target context.
- `targetId` takes precedence over coordinates.
- Coordinate mode resolves to a real symbol target and exposes a reusable `targetId`.
- `code_context` is not a point-inspection tool; use `code_inspect` for point-level facts when no symbol target can be resolved.
- `scope` remains a selection/orientation boundary. It is ignored for precise target calls with a visible note. Future evidence filtering should use a separate parameter such as `within`/`evidenceScope`, not `scope`.
- Anchored `code_resolve` can snap declaration/header coordinates to a name anchor only when provider-backed and unambiguous.

**Files:**

- `packages/supi-code-intelligence/README.md` — update tool overview, shared input conventions, and cookbook examples.
- `packages/supi-code-intelligence/CLAUDE.md` — update package-local agent notes.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — update descriptions and prompt guidelines.
- `packages/supi-code-intelligence/src/workflow/schemas.ts` — ensure parameter descriptions describe coordinate target mode and `scope` semantics.
- `CONTEXT.md` — add glossary only if new domain terms are introduced; avoid implementation details.

**Acceptance criteria:**

- README states that `code_context` accepts `targetId` or `file + line + character` for precise target context.
- README and CLAUDE explain that `scope` is not a downstream evidence filter for precise targets.
- Tool descriptions/guidelines mention `targetId` precedence and coordinate mode without overloading the prompt.
- Schema descriptions are clear enough that generated tool docs tell an agent what to pass.
- No docs imply that anonymous point targets are valid for `code_context` target sections.
