// Prompt guidance and tool description for the code_intel tool.

import { CODE_INTEL_ACTION_SPECS, formatCodeIntelActionList } from "./action-specs.ts";

export const toolDescription = `Code intelligence tool — codebase orientation, semantic relationships, impact analysis, and scoped search.

Actions: ${formatCodeIntelActionList()}.

Use code_intel to localize relevant files before precise drill-down: summarize a project/package/file, find callers/callees/implementations, estimate blast radius, or search within a scope. Prefer lsp_lookup, lsp_document_symbols, lsp_workspace_symbols, lsp_diagnostics, lsp_refactor, and lsp_recover for semantic drill-down once the target is known; use tree_sitter for exact syntax and read/rg once you know the file. line and character are 1-based and require file. pattern is literal unless regex is true; kind supports definition, export, or import. Relative paths resolve from cwd, and leading @ on path/file is stripped.`;

export const promptGuidelines = [
  ...CODE_INTEL_ACTION_SPECS.map((spec) => spec.promptGuideline),
  "Use code_intel with `file`, `line`, and `character` for anchored positions; do not pair `line` or `character` with `path`.",
  "Use code_intel first when the area is not yet localized; switch to lsp_lookup, lsp_document_symbols, lsp_workspace_symbols, lsp_diagnostics, lsp_refactor, or lsp_recover for semantic drill-down once code_intel narrows the target.",
];

export const promptSnippet =
  "code_intel — codebase orientation, callers/callees, blast radius, and scoped search before file drill-down";
