/**
 * Normalized intent and routing types for the code-intelligence planner.
 *
 * These types are shared between the analysis layer (planner) and the
 * tool layer (specs) so they live here to avoid circular dependencies.
 */

/** Canonical code-intelligence tool names, including internal compatibility aliases. */
export const CODE_INTELLIGENCE_TOOL_NAMES = [
  "code_inspect",
  "code_orientation",
  "code_impact",
  "code_affected",
  "code_find",
  "code_graph",
  "code_health",
  "code_refactor_plan",
  "code_refactor_apply",
  "code_resolve",
] as const;
export type CodeIntelligenceToolName = (typeof CODE_INTELLIGENCE_TOOL_NAMES)[number];

/** Public/model-facing tool names registered on the extension surface. */
export const PUBLIC_CODE_INTELLIGENCE_TOOL_NAMES = [
  "code_inspect",
  "code_orientation",
  "code_impact",
  "code_find",
  "code_graph",
  "code_health",
  "code_refactor_plan",
  "code_refactor_apply",
  "code_resolve",
] as const;
export type PublicCodeIntelligenceToolName = (typeof PUBLIC_CODE_INTELLIGENCE_TOOL_NAMES)[number];

/**
 * Relation kind names — no longer used in the high-level code_* surface.
 * Kept for legacy compatibility in substrate routing code.
 */
export const CODE_RELATION_KIND_NAMES = ["callers", "callees", "implementations"] as const;
export type CodeRelationsKind = (typeof CODE_RELATION_KIND_NAMES)[number];

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

/**
 * A resolved intents for a tool execution request.
 * Provides the normalized target and routing info together.
 */
export interface ResolvedIntent {
  tool: CodeIntelligenceToolName;
  relationsKind?: CodeRelationsKind;
  route: PlannerRoute;
}
