# Task 2: Add per-position code actions to code_brief anchored output

Add per-position code action suggestions to code_brief(file, line, character) output.

The SemanticProvider already has `codeActions?` and the LSP adapter implements it. Just needs forwarding through the composite provider and gathering/rendering in the brief path.

Steps:
1. supi-code-intelligence: Forward `codeActions?` through composite provider in request-context.ts
2. supi-code-intelligence: Add `codeActions` to TreeSitterContext and gather in generate-brief.ts
3. supi-code-intelligence: Render `## Code Actions` section in brief.ts markdown (similar to code_health's rendering)
4. Add tests
