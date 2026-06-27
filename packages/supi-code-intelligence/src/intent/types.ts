/**
 * Normalized intent and routing types for the code-intelligence planner.
 *
 * These types are shared between the analysis layer (planner) and the
 * tool layer (specs) so they live here to avoid circular dependencies.
 */

/** Canonical code-intelligence tool names. */
export const CODE_INTELLIGENCE_TOOL_NAMES = [
  "code_resolve",
  "code_inspect",
  "code_orientation",
  "code_find",
  "code_graph",
  "code_impact",
  "code_refactor_plan",
  "code_refactor_apply",
  "code_health",
] as const;

/** Canonical code-intelligence tool name. */
export type CodeIntelligenceToolName = (typeof CODE_INTELLIGENCE_TOOL_NAMES)[number];

/**
 * A route describes how the planner recommends handling a tool intent.
 */
export interface PlannerRoute {
  /** Whether a semantic (LSP-backed) provider is available */
  semanticAvailable: boolean;
  /** Whether a structural (tree-sitter-backed) provider is available */
  structuralAvailable: boolean;
  /** Whether precise refactoring is available */
  refactorAvailable: boolean;
  /**
   * The preferred execution strategy for this intent.
   * - `semantic`: use LSP first
   * - `structural`: use tree-sitter first
   * - `search`: use explicit text/heuristic search
   * - `unavailable`: no capability can satisfy this intent
   */
  preferred: "semantic" | "structural" | "search" | "unavailable";
}
