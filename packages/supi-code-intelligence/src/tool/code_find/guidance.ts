export const toolDescription =
  'Search source shape with mode:"ast" or LSP workspace symbols with mode:"semantic". Modes never silently fall back. Unscoped AST scans cover visible supported files, skipping hidden and generated/dependency directories.';

export const promptSnippet = "explicit structural or semantic code search";

export const promptGuidelines = [
  "Use code_find for structural or semantic search evidence; use PI grep for literal/regex source search and code_graph references for symbol-identity relationships.",
];
