/**
 * Canonical planned V2 workflow tool names.
 *
 * Phase 0 note: this is design metadata only. The current registered public tool
 * surface still lives in `src/tool/tool-specs.ts`, `src/lsp/tool-specs.ts`, and
 * `src/tree-sitter/tool-specs.ts` until later migration phases replace it.
 */
export const WORKFLOW_CODE_TOOL_NAMES = [
  "code_resolve",
  "code_context",
  "code_find",
  "code_graph",
  "code_impact",
  "code_refactor",
  "code_apply",
  "code_health",
] as const;

export type WorkflowCodeToolName = (typeof WORKFLOW_CODE_TOOL_NAMES)[number];
