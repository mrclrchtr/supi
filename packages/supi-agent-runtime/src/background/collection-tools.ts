import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AGENT_CANCEL_TOOL_NAME, AGENT_RESULT_TOOL_NAME } from "../tool/names.ts";

const COLLECTION_TOOL_NAMES = [AGENT_RESULT_TOOL_NAME, AGENT_CANCEL_TOOL_NAME];

/** One owner's demand for the collection tools; `undefined` counts as needing them. */
interface CollectionToolDemand {
  readonly options: { readonly collection?: unknown };
  readonly collectionToolsActive?: boolean;
}

/**
 * Activate `agent_result` and `agent_cancel` while any collection owner needs them. Nothing
 * changes until an owner states a demand, so owners that never call `setCollectionToolsActive`
 * keep Pi's registration default.
 */
export function syncCollectionTools(
  pi: ExtensionAPI,
  owners: Iterable<CollectionToolDemand>,
): void {
  const collecting = [...owners].filter((owner) => owner.options.collection);
  if (collecting.every((owner) => owner.collectionToolsActive === undefined)) return;
  const active = collecting.some((owner) => owner.collectionToolsActive !== false);
  const current = pi.getActiveTools();
  const next = active
    ? [...new Set([...current, ...COLLECTION_TOOL_NAMES])]
    : current.filter((name) => !COLLECTION_TOOL_NAMES.includes(name));
  if (next.length !== current.length) pi.setActiveTools(next);
}
