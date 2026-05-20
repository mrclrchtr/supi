// Prompt guidance and tool description for the tree_sitter tool.
//
// Note: We intentionally do NOT include cross-tool routing (e.g., "use lsp for
// type info") because this package can be installed standalone without supi-lsp.

export const toolDescription = `Tree-sitter tool — parser-level structure and syntax queries for supported files.

Actions: outline, imports, exports, node_at, query, callees.

Use tree_sitter when you need exact syntax nodes, shallow structure, parsed imports/exports, or custom AST queries inside a supported file. Use 1-based line/character coordinates. Relative paths resolve from the session working directory.

Supported extensions: .ts, .tsx, .js, .jsx, .mts, .cts, .mjs, .cjs, .py, .pyi, .rs, .go, .mod, .c, .h, .cpp, .hpp, .cc, .cxx, .hxx, .c++, .h++, .java, .kt, .kts, .rb, .sh, .bash, .zsh, .html, .htm, .xhtml, .r, .sql`;

export const promptGuidelines = [
  "Use tree_sitter.outline(file) to get a shallow structural outline of a JavaScript or TypeScript file.",
  "Use tree_sitter.imports(file) to list parsed imports from a JavaScript or TypeScript file.",
  "Use tree_sitter.exports(file) to list parsed exports from a JavaScript or TypeScript file.",
  "Use tree_sitter.node_at(file, line, character) for the exact syntax node at a position.",
  "Use tree_sitter.callees(file, line, character) for outgoing calls from a position.",
  "Use tree_sitter.query(file, query) for custom parser-level syntax matches.",
  "Use tree_sitter when the question is about syntax, node types, source ranges, or parser-level structure within a supported file.",
  "Do not use tree_sitter for type information, cross-file references, or semantic renames; prefer semantic language-server tooling when available.",
];

export const promptSnippet =
  "tree_sitter — syntax trees, parsed imports/exports, node lookup, and custom AST queries";
