## Approved design

### Goal
Make `@mrclrchtr/supi-code-intelligence` the only pi-installable package for the code-understanding stack while keeping `@mrclrchtr/supi-lsp` and `@mrclrchtr/supi-tree-sitter` published as direct-import libraries.

### Locked decisions
- `@mrclrchtr/supi-code-intelligence` becomes the only package in this family with a `pi.extensions` install surface.
- `@mrclrchtr/supi-lsp` and `@mrclrchtr/supi-tree-sitter` stay published, but as library packages.
- Low-level TypeScript consumers keep importing directly from `@mrclrchtr/supi-lsp/api` and `@mrclrchtr/supi-tree-sitter/api`.
- All pi-facing tool registration, prompt guidance, settings/commands/renderers, and session wiring move into `supi-code-intelligence`.
- The model-facing expert tool names stay the same for now: `lsp_*` and `tree_sitter_*` remain public alongside `code_*`.
- User-facing UX should be unified under `supi-code-intelligence` rather than preserving substrate-specific install surfaces.

### Package roles after the refactor
#### `packages/supi-lsp`
Owns the semantic runtime library:
- LSP client and manager lifecycle primitives
- session-scoped semantic service publication
- diagnostics and recovery logic
- LSP config/settings data helpers
- stable library APIs needed by the umbrella extension

Does not own:
- `pi.extensions`
- `lsp_*` tool registration
- prompt guidance
- custom renderers or commands
- settings registration UI

#### `packages/supi-tree-sitter`
Owns the structural runtime library:
- parser/runtime lifecycle primitives
- shared session-scoped structural service publication
- grammar detection and structural analyses
- stable library APIs needed by the umbrella extension

Does not own:
- `pi.extensions`
- `tree_sitter_*` tool registration
- prompt guidance
- pi session wiring

#### `packages/supi-code-intelligence`
Owns the full pi adapter layer:
- registers `code_*`, `lsp_*`, and `tree_sitter_*`
- owns prompt guidance for all three tool families
- owns unified status/settings/renderer UX
- owns first-turn overview injection and substrate session wiring
- depends on `supi-lsp` and `supi-tree-sitter` only through their public `/api` surfaces

### Architectural direction
Use substrate libraries for runtime and session-scoped services, and keep all agent-facing policy in `supi-code-intelligence`.

That means the refactor should introduce or promote stable session-controller APIs from the substrate packages where needed, instead of letting `supi-code-intelligence` reach into internal `src/...` modules.

### Packaging outcome
- `packages/supi-lsp/package.json` and `packages/supi-tree-sitter/package.json` stop advertising pi install surfaces.
- `packages/supi-code-intelligence/package.json` becomes the only published package in this family that advertises pi installation for the code-understanding stack.
- Workspace root docs and package docs should clearly distinguish the umbrella install path from direct library consumption.

### Non-goals
- Do not rename the public `lsp_*` or `tree_sitter_*` tool names in this change.
- Do not collapse the runtime logic into a single monolith package.
- Do not widen the scope into unrelated substrate refactors beyond what is needed to create clean public library APIs.