import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { BackgroundRunBatches } from "../background/controller.ts";
import { findRuntimeState } from "../session/runtime-state.ts";

/** The Background Run Batches of the current session, looked up at call time. */
export function currentRunBatches(pi: ExtensionAPI): BackgroundRunBatches | undefined {
  return findRuntimeState(pi)?.background;
}

/** The current session's batches, or the error every unknown or expired handle receives. */
export function requireRunBatches(pi: ExtensionAPI): BackgroundRunBatches {
  const batches = currentRunBatches(pi);
  if (!batches) throw new Error("Unknown or expired background batch handle.");
  return batches;
}
