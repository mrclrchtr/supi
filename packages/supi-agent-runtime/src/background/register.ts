import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runtimeState } from "../session/runtime-state.ts";
import { BackgroundRunBatches } from "./controller.ts";
import type { RunBatchHandle, RunBatchOwner, RunBatchOwnerOptions } from "./types.ts";

/**
 * Register an owner package for the Background Run Batches of the containing session and return
 * its access. Call it on every `session_start`: the batches belong to one session and close on
 * `session_shutdown`. All bundled runtime copies in a Pi runtime share one set of batches.
 * Registering again with the same `noticeType` replaces the owner's options.
 */
export function registerRunBatchOwner<THandle extends RunBatchHandle, TData = undefined>(
  pi: ExtensionAPI,
  options: RunBatchOwnerOptions<THandle>,
): RunBatchOwner<THandle, TData> {
  const state = runtimeState(pi);
  if (!state.background) {
    state.background = new BackgroundRunBatches(state.registry);
    bindSessionEvents(pi, state.background);
  }
  return state.background.registerOwner<THandle, TData>(pi, options);
}

/**
 * Bind parent turn, branch, input, and shutdown events to one session's batches. The creating
 * copy binds them, so a shared state created by an older runtime copy still receives them.
 */
function bindSessionEvents(pi: ExtensionAPI, batches: BackgroundRunBatches): void {
  pi.on("session_tree", (_event, ctx) => batches.refresh(ctx));
  pi.on("context", (event, ctx) => batches.filterContext(event.messages, ctx));
  pi.on("agent_start", (_event, ctx) => batches.observeParent(ctx.signal));
  pi.on("agent_settled", (event, ctx) => batches.settleParent(event.aborted, ctx));
  pi.on("input", (event) => {
    if (event.source !== "extension") batches.resumeDelivery();
  });
  pi.on("turn_end", (_event, ctx) => batches.refresh(ctx));
  pi.on("session_shutdown", () => batches.close());
}
