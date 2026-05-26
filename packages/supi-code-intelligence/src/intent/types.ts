/**
 * Normalized intent and routing types for the code-intelligence planner.
 *
 * These types are shared between the analysis layer (planner) and the
 * tool layer (specs) so they live here to avoid circular dependencies.
 */

/** Canonical code-intelligence tool names. */
export const CODE_INTELLIGENCE_TOOL_NAMES = [
  "code_brief",
  "code_map",
  "code_relations",
  "code_affected",
  "code_pattern",
  "code_refactor",
] as const;
export type CodeIntelligenceToolName = (typeof CODE_INTELLIGENCE_TOOL_NAMES)[number];

/** Canonical relation kind names. */
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
