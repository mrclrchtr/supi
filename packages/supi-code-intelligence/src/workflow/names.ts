/**
 * Canonical V2 workflow tool names.
 *
 * All workflow names below are now active on the public surface. The list
 * remains the design source of truth for tests, docs, and future extensions.
 */
export const WORKFLOW_CODE_TOOL_NAMES = [
  "code_resolve",
  "code_inspect",
  "code_context",
  "code_find",
  "code_graph",
  "code_impact",
  "code_refactor",
  "code_apply",
  "code_health",
] as const;

export type WorkflowCodeToolName = (typeof WORKFLOW_CODE_TOOL_NAMES)[number];
