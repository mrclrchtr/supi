export const toolDescription =
  "Search workspace symbols in semantic mode, or declaration, import, export, and call names in AST mode. Use grep for literal or regular-expression file-content search. The selected mode does not switch to another search method.";

export const promptSnippet = "search code structure or workspace symbols";

export const promptGuidelines = [
  "For declarations whose name contains a fragment, call code_find with ast kind definition instead of an rg keyword pattern, which also matches imports and misses methods.",
];
