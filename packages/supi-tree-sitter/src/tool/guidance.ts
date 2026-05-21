// Prompt guidance and tool description for the tree_sitter tool.
//
// Note: We intentionally do NOT include cross-tool routing (e.g., "use lsp for
// type info") because this package can be installed standalone without supi-lsp.

import {
  formatTreeSitterActionList,
  getTreeSitterActionNamesByGuidanceGroup,
} from "./action-specs.ts";

const jsTsStructureActions = getTreeSitterActionNamesByGuidanceGroup("js-ts-structure")
  .map((action) => `tree_sitter.${action}(file)`)
  .join(", ");

export const toolDescription = `Tree-sitter tool — parser-level structure and syntax queries for supported files.

Actions: ${formatTreeSitterActionList()}.

Use tree_sitter for exact syntax nodes, shallow structure, parsed imports/exports, outgoing calls, or custom AST queries within one file. file is required for all actions. line and character are 1-based UTF-16 coordinates for node_at and callees. query is required for query. outline, imports, and exports are JavaScript/TypeScript-only; node_at and query work across supported grammars; callees works for many grammars. Relative paths resolve from the session working directory, and a leading @ on file paths is stripped.`;

export const promptGuidelines = [
  `Use ${jsTsStructureActions} for shallow JavaScript or TypeScript structure without reading the whole file.`,
  "Use tree_sitter.node_at(file, line, character) for the exact syntax node and ancestry at a known position.",
  "Use tree_sitter.callees(file, line, character) for outgoing calls from the enclosing function or method at a known position.",
  "Use tree_sitter.query(file, query) for custom Tree-sitter patterns when the built-in actions are not specific enough.",
  "Use tree_sitter for syntax, node types, source ranges, and other parser-backed structure within one supported file.",
  "Do not use tree_sitter for type information, cross-file references, semantic renames, or codebase-wide orientation.",
];

export const promptSnippet =
  "tree_sitter — parser-backed single-file structure, node lookup, callees, and AST queries";
