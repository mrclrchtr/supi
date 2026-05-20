// Prompt guidance and tool description for the code_intel tool.

export const toolDescription = `Code intelligence tool — codebase orientation, semantic relationships, impact analysis, and scoped search.

Actions: brief, callers, callees, implementations, affected, pattern, index.

Use code_intel before precise file-level drill-down when you need architecture overviews, project landmarks, call relationships, downstream impact, or bounded search. Coordinates are 1-based (line, character). Relative paths resolve from the session working directory. A leading @ on path/file is stripped automatically.`;

export const promptGuidelines = [
  "Use code_intel.brief(...) when you need architecture, ownership, or file/package intent before opening specific files.",
  "Use code_intel.index() when you need a project layout, module map, or high-level landmarks.",
  "Use code_intel.callers(...) when you need to know who invokes a symbol, and use code_intel.implementations(...) when you need concrete implementations of an interface or declaration.",
  "Use code_intel.callees(...) when you need outgoing call relationships from a function or anchored position.",
  "Use code_intel.affected(...) before edits when you need blast radius, downstream impact, or likely follow-up checks.",
  "Use code_intel.pattern(...) for bounded text search within a path; code_intel.pattern treats `pattern` as literal by default, uses `regex: true` for regex, and accepts `kind` for definition/export/import filtering.",
  "Use code_intel first when the relevant area of the codebase is not yet localized; switch to lsp, tree_sitter, or read/rg after code_intel narrows the target.",
  "Use lsp instead of code_intel when you need type information, a symbol definition, references, renames, or a code action.",
  "Use tree_sitter instead of code_intel when you need exact syntax nodes, parsed imports/exports, or AST queries.",
  "Use read/rg instead of code_intel when you already know the exact file and just need raw text.",
];

export const promptSnippet =
  "code_intel — orient yourself in the codebase before drilling into exact symbols, syntax nodes, or raw file text";
