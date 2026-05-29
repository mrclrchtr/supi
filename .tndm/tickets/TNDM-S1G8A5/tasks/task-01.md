# Task 1: Add definition to code_brief anchored output

Wire lsp_definition through the provider chain and render `## Definition` in code_brief(file, line, character) output.

Steps:
1. supi-code-runtime: Add optional `definition?` to SemanticProvider returning `CodeLocation[] | null`
2. supi-lsp: Wire `definition` in createLspSemanticProvider (SessionLspService.definition() already exists)
3. supi-code-intelligence: Add `definition` to composite provider in request-context.ts
4. supi-code-intelligence: Add `definition` to TreeSitterContext and gather in generate-brief.ts
5. supi-code-intelligence: Render `## Definition` section in brief.ts markdown
6. Add tests
