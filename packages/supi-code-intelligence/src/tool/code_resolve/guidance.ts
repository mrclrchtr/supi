export const toolDescription =
  "Resolve a real symbol anchor or semantic query to target handles for later code tools, or list a file's declarations as a file outline. This tool does not search file text.";

export const promptSnippet = "resolve symbols or file declarations";

export const promptGuidelines = [
  "When a search pattern is one identifier and you need its declaration, call code_resolve instead of rg.",
];
