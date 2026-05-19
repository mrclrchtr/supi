// Prompt guidance and tool description for the code_intel tool.

export const toolDescription = `Code intelligence tool — codebase orientation, semantic relationships, impact analysis, and scoped search.

Actions:
- brief: summarize a project, package, directory, file, or anchored symbol
- callers: find call sites for a symbol or analyze a file export surface
- callees: find outgoing calls from a symbol or anchored position
- implementations: find concrete implementations of an interface or abstract type
- affected: estimate blast radius for a symbol or exported file surface
- pattern: bounded text search with optional regex and kind filters
- index: summarize project layout

Coordinates are 1-based (line, character). Relative paths resolve from the session working directory. A leading @ on path/file is stripped automatically.`;

export const promptGuidelines = [
  `Route questions like this:
  if you need architecture or file/package intent → code_intel.brief(...)
  if you need project layout or landmarks → code_intel.index()
  if you need who calls, what implements, or what a symbol calls → code_intel.callers(...) / code_intel.implementations(...) / code_intel.callees(...)
  if you need blast radius or downstream impact → code_intel.affected(...)
  if you need type info, symbol definition, references, rename, or a code action → lsp
  if you need exact syntax nodes, imports/exports, or AST queries → tree_sitter
  if you already know the file and just need raw text → read/rg`,
  "Use code_intel.pattern for literal text within a path. Add regex: true for regex search, and add kind for definition/export/import filtering.",
  "Use code_intel first when the area is not yet localized; once localized, switch to lsp, tree_sitter, or read/rg for the exact drill-down you need.",
];

export const promptSnippet =
  "Use `code_intel` to orient yourself in the codebase before drilling into exact symbols, syntax nodes, or raw file text.";
