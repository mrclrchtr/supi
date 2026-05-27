/**
 * Internal branded-handle contracts for the planned workflow-oriented V2 surface.
 *
 * Phase 0 note:
 * - These are documentation-first type aliases only.
 * - No runtime generator or persistence format exists yet.
 * - Future phases should treat these as workspace/session-scoped handles unless a
 *   specific service explicitly persists them with fingerprint checks.
 */

declare const workflowHandleBrand: unique symbol;

type WorkflowHandle<Brand extends string> = string & {
  readonly [workflowHandleBrand]: Brand;
};

/**
 * Stable-enough handle for a resolved code target inside one workspace/session.
 *
 * Future phases should generate this from the target-resolution pipeline instead of
 * asking callers to repeat fragile `file` / `line` / `character` coordinates.
 */
export type TargetId = WorkflowHandle<"TargetId">;

/**
 * Handle for a concrete source span or snippet region.
 *
 * Spans are expected to become invalid when the underlying file fingerprint changes.
 */
export type SpanId = WorkflowHandle<"SpanId">;

/**
 * Handle for a node in a future relation/dependency graph.
 *
 * Graph node identifiers should be produced by graph-building services so callers can
 * traverse relationships without re-resolving the same symbol repeatedly.
 */
export type GraphNodeId = WorkflowHandle<"GraphNodeId">;

/**
 * Handle for a stored edit/refactor plan.
 *
 * Plans must eventually be guarded by workspace fingerprints and stale-plan checks
 * before `code_apply` can mutate files safely.
 */
export type PlanId = WorkflowHandle<"PlanId">;

/**
 * Handle for one proposed or applied change within a larger plan.
 *
 * This exists so later phases can report granular edit provenance and rollback data
 * without overloading `PlanId` with per-edit semantics.
 */
export type ChangeId = WorkflowHandle<"ChangeId">;
