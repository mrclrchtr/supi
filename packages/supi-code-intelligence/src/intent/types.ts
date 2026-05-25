/**
 * Normalized intent and routing types for the code-intelligence planner.
 */
import type { CodeIntelligenceToolName, CodeRelationsKind } from "../tool/tool-specs.ts";

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
