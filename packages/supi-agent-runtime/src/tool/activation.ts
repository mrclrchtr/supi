import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RunBatchCollection } from "../background/types.ts";
import { COLLECTION_TOOL_NAMES } from "./names.ts";

/**
 * Activate `agent_result` and `agent_cancel` while any owner needs them and deactivate them
 * otherwise, preserving other active tools. While no owner states `toolsNeeded`, Pi's activation
 * on registration and later user choices stand.
 */
export function syncCollectionToolActivation(
  pi: ExtensionAPI,
  collections: readonly Pick<RunBatchCollection, "toolsNeeded">[],
): void {
  if (!collections.some((collection) => collection.toolsNeeded)) return;
  const needed = collections.some((collection) => collection.toolsNeeded?.() !== false);
  const active = pi.getActiveTools();
  const next = needed
    ? [...new Set([...active, ...COLLECTION_TOOL_NAMES])]
    : active.filter((name) => !COLLECTION_TOOL_NAMES.includes(name));
  if (next.length !== active.length) pi.setActiveTools(next);
}
