import type { ChangeId, GraphNodeId, SpanId, TargetId } from "./ids.ts";
import type { WorkflowCodeToolName } from "./surface.ts";

/** Evidence family used to produce one item or summary. */
export type WorkflowProvenanceSource =
  | "semantic"
  | "structural"
  | "search"
  | "git"
  | "diagnostics"
  | "heuristic";

/** Coarse confidence label for a planned workflow result. */
export type WorkflowConfidence = "low" | "medium" | "high";

/** 1-based source position for planned workflow responses. */
export interface WorkflowPosition {
  line: number;
  character: number;
}

/**
 * File-backed source span used across planned V2 results.
 *
 * `spanId` is optional because some future results may only have a concrete range on
 * first construction and derive the durable handle later.
 */
export interface WorkflowSpan {
  spanId?: SpanId;
  file: string;
  start: WorkflowPosition;
  end: WorkflowPosition;
}

/**
 * Atomic result item shared by resolve/find/context/graph/impact-style tools.
 *
 * The shape is intentionally broad enough to cover snippets, graph nodes, impact
 * entries, and diagnostics without forcing every tool into a giant bespoke DTO tree.
 */
export interface WorkflowItem {
  targetId?: TargetId;
  span?: WorkflowSpan;
  graphNodeId?: GraphNodeId;
  changeId?: ChangeId;
  symbol?: string;
  snippet?: string;
  reason?: string;
  provenance: WorkflowProvenanceSource[];
}

/**
 * Suggested next step emitted by a workflow tool.
 *
 * `paramsSummary` is human/model guidance only in Phase 0; it is not a substitute for
 * validated tool parameters during execution.
 */
export interface WorkflowNextAction {
  tool: WorkflowCodeToolName;
  reason: string;
  paramsSummary?: string;
}

/**
 * Shared envelope for future V2 workflow tools.
 *
 * Markdown remains useful for human review, but the structured fields are the primary
 * contract for follow-up tool calls and machine reasoning.
 */
export interface WorkflowResultEnvelope {
  markdown: string;
  confidence: WorkflowConfidence;
  provenance: WorkflowProvenanceSource[];
  items: WorkflowItem[];
  omittedCount?: number;
  nextActions?: WorkflowNextAction[];
}
