// Prompt guidance and tool description for the code_intel tool.

export const toolDescription = `Code intelligence tool — codebase orientation, semantic relationships, impact analysis, and scoped search.

Actions: brief, callers, callees, implementations, affected, pattern, index.

Use code_intel to localize relevant files before precise drill-down: summarize a project/package/file, find callers/callees/implementations, estimate blast radius, or search within a scope. Prefer lsp for semantic info, tree_sitter for exact syntax, and read/rg once you know the file. line and character are 1-based and require file. pattern is literal unless regex is true; kind supports definition, export, or import. Relative paths resolve from cwd, and leading @ on path/file is stripped.`;

export const promptGuidelines = [
  'Use code_intel with `action: "brief"` for a project, package, directory, file, or anchored-position brief before opening more files.',
  'Use code_intel with `action: "index"` for a project map, top-level directories, language mix, or landmark files.',
  'Use code_intel with `action: "callers"` or `action: "implementations"` to find who invokes a symbol or which concrete types implement a declaration.',
  'Use code_intel with `action: "callees"` for outgoing calls from a function or method at a known `file`, `line`, and `character`.',
  'Use code_intel with `action: "affected"` before edits for blast radius, downstream modules, risk, and likely follow-up checks or tests.',
  'Use code_intel with `action: "pattern"` for bounded search within a path; `pattern` is literal by default, set `regex: true` for regex, and use `kind: "definition" | "export" | "import"` for structured search.',
  "Use code_intel with `file`, `line`, and `character` for anchored positions; do not pair `line` or `character` with `path`.",
  "Use code_intel first when the area is not yet localized; switch to lsp for semantic info, tree_sitter for exact syntax, and read/rg for raw text once code_intel narrows the target.",
];

export const promptSnippet =
  "code_intel — codebase orientation, callers/callees, blast radius, and scoped search before file drill-down";
