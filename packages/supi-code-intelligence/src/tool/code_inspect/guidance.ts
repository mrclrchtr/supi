export const toolDescription =
  "Inspect one source location for syntax, its enclosing declaration, hover information, definitions, and nearby diagnostics. Use it for point-local facts, not broad code context.";

export const promptSnippet = "inspect a source location";

export const promptGuidelines = [
  "Use code_inspect for diagnostics near a source location; use code_health for broader diagnostics or language-server status.",
];
