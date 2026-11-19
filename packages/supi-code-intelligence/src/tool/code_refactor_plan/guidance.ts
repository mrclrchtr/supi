export const toolDescription =
  "Create and store a semantic refactor preview without changing files. Unsupported operations do not fall back to text edits.";

export const promptSnippet = "preview a semantic refactor";

export const promptGuidelines = [
  "Rename a symbol across files with code_refactor_plan rename_symbol instead of text edits.",
];
