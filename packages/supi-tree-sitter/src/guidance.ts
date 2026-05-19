// Prompt guidance and tool description for the tree_sitter tool.

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
  `Use tree_sitter for parser-level structure.
  if you need declarations in one file → outline(file)
  if you need imports or exports exactly as parsed → imports(file) / exports(file)
  if you need the exact node at a position → node_at(file, line, character)
  if you need outgoing calls from a position → callees(file, line, character)
  if you need a custom syntax match → query(file, query)`,
  "Use tree_sitter when the question is about syntax, node types, source ranges, or parser-level structure.",
];

export const promptSnippet = `Use 'tree_sitter' for syntax trees, parsed imports/exports, node lookup, and custom queries.`;
