export const toolDescription =
  "Find semantic references and implementations, or non-symbol-aware structural calls written inside a target's enclosing scope. To find relationships for a known symbol or source position, pass it directly as the target. Select it before changing or removing a symbol.";

export const promptSnippet = "trace code relationships";

export const promptGuidelines = [
  "Before renaming, removing, or changing the signature of an exported symbol, call code_graph for its references; text search also matches unrelated symbols with the same name.",
  "For several symbols, issue one code_graph call per symbol in the same turn instead of one text search for all of them.",
];
