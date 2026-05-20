// Prompt guidance and tool description for the tree_sitter tool.
//
// Note: We intentionally do NOT include cross-tool routing (e.g., "use lsp for
// type info") because this package can be installed standalone without supi-lsp.

export const toolDescription = `Tree-sitter tool — parser-level structure for supported files.

Actions:
- outline: declarations in one JavaScript/TypeScript file
- imports: parsed import statements in one JavaScript/TypeScript file
- exports: parsed export declarations in one JavaScript/TypeScript file
- node_at: exact syntax node at file/line/character
- query: custom Tree-sitter query on one file
- callees: outgoing calls from a position

Use 1-based line/character coordinates. Relative paths resolve from the session working directory.

Supported extensions: .ts, .tsx, .js, .jsx, .mts, .cts, .mjs, .cjs, .py, .pyi, .rs, .go, .mod, .c, .h, .cpp, .hpp, .cc, .cxx, .hxx, .c++, .h++, .java, .kt, .kts, .rb, .sh, .bash, .zsh, .html, .htm, .xhtml, .r, .sql`;

export const promptGuidelines = [
  "Use tree_sitter.outline(file), tree_sitter.imports(file), and tree_sitter.exports(file) for JavaScript and TypeScript files only.",
  "Use tree_sitter.node_at(file, line, character) for the exact syntax node at a position.",
  "Use tree_sitter.callees(file, line, character) for outgoing calls from a position.",
  "Use tree_sitter.query(file, query) for custom syntax matches.",
  "Use tree_sitter when the question is about syntax, node types, source ranges, or parser-level structure.",
  "Do not use tree_sitter for type information, cross-file references, or semantic renames — prefer language-server tooling when available.",
];

export const promptSnippet =
  "Use `tree_sitter` for syntax trees, parsed imports/exports, node lookup, and custom queries.";
