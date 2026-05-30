/**
 * Canonical V2 workflow tool names.
 *
 * Active workflow-aligned tools: `code_resolve`, `code_context`, `code_find`,
 * `code_graph`, and `code_health`. Remaining names stay as roadmap metadata for
 * later phases.
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
