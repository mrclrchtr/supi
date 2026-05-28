/**
 * Canonical planned V2 workflow tool names.
 *
 * Phase 1.5 note: `code_resolve` and `code_health` are active. Remaining names
 * are design metadata for future phases.
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
