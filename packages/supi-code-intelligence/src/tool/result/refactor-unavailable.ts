/** Unavailable reasons shared by code_refactor_plan and code_refactor_apply. */

/** supi-lsp text for a request superseded by a file change while it ran. */
const SEMANTIC_INPUT_CHANGED = "Semantic input changed";
const CONCURRENT_EDIT_HINT = "Retry after concurrent edits finish.";

/**
 * Add a recovery hint to a reason caused by a concurrent edit, for example a
 * plan running in parallel with an apply. Other reasons are returned unchanged.
 */
export function refactorUnavailableReason(reason: string): string {
  if (!reason.includes(SEMANTIC_INPUT_CHANGED) || reason.includes(CONCURRENT_EDIT_HINT)) {
    return reason;
  }
  return `${reason} ${CONCURRENT_EDIT_HINT}`;
}
