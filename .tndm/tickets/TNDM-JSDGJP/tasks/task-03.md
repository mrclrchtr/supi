# Task 3: Document the V2 skeleton and phase boundaries in package docs

# Goal

Update package-level docs so future agents understand that Phase 0 is a non-behavioral skeleton and that later tickets will implement/remove public tools in phases.

# Files

Modify:

- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

# Changes

## README

Add a concise "V2 workflow roadmap" section that explains:

- current runtime surface remains unchanged in Phase 0
- planned V2 public surface names:
  - `code_resolve`
  - `code_context`
  - `code_find`
  - `code_graph`
  - `code_impact`
  - `code_refactor`
  - `code_apply`
  - `code_health`
- `src/workflow/` is an internal skeleton/source of design truth, not active tool registration
- raw `lsp_*` and `tree_sitter_*` are still public until a later phase provides replacements and removes registration

## CLAUDE.md

Add maintainer guidance explaining:

- Phase 0 creates docs/types/schemas only
- future phases must not edit the skeleton inconsistently with tests
- do not remove substrate tools until `code_health`, `code_context`, `code_find`, `code_graph`, and refactor/apply replacements cover their high-value uses
- use separate tickets, verification, user review, and commit between phases

# Test exemption

Docs-only task. TDD is not practical beyond the skeleton tests from Tasks 1–2.

# Manual verification

Run:

```bash
rg "V2 workflow|src/workflow|code_resolve|code_health" packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
```

Expected result: both files contain the roadmap/skeleton guidance and mention `src/workflow/`.

