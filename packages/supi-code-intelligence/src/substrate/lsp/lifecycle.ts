// LSP lifecycle backed by the process-shared Workspace provider host.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { acquireWorkspaceProviderHost } from "../workspace-provider-host.ts";
import { LSP_STATE_CHANGE_EVENT, type LspAdapterState } from "./state.ts";

/** Acquire providers once per workspace and release them after the final Pi session ends. */
export function registerLspSessionLifecycle(
  pi: ExtensionAPI,
  state: LspAdapterState,
  onStarted?: (ctx: ExtensionContext) => void | Promise<void>,
): void {
  let disposeLifecycle: (() => void) | null = null;
  let subscriptionGeneration = 0;

  function dispatchStateChange(): void {
    state.stateChanges.dispatchEvent(new Event(LSP_STATE_CHANGE_EVENT));
  }

  function stopLifecycleSubscription(): void {
    subscriptionGeneration++;
    disposeLifecycle?.();
    disposeLifecycle = null;
  }

  function startLifecycleSubscription(): void {
    stopLifecycleSubscription();
    const controller = state.controller;
    if (!controller) {
      dispatchStateChange();
      return;
    }
    const generation = subscriptionGeneration;
    let receivedInitialTransition = false;
    disposeLifecycle = controller.subscribeLifecycle(() => {
      if (generation !== subscriptionGeneration) return;
      receivedInitialTransition = true;
      dispatchStateChange();
    });
    if (!receivedInitialTransition) dispatchStateChange();
  }

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    stopLifecycleSubscription();
    await state.providerLease?.release();
    state.providerLease = null;
    state.controller = null;
    state.lspActive = false;
    state.sentinelSnapshot = new Map();

    const lease = await acquireWorkspaceProviderHost(ctx.cwd, {
      projectTrusted: ctx.isProjectTrusted(),
    });
    state.providerLease = lease;
    state.controller = lease.lspController;
    state.lspActive = lease.lspController?.kind === "ready";
    state.sentinelSnapshot = lease.sentinelSnapshot;
    await onStarted?.(ctx);
    startLifecycleSubscription();
  });

  pi.on("session_shutdown", async () => {
    stopLifecycleSubscription();
    await state.providerLease?.release();
    state.providerLease = null;
    state.controller = null;
    state.lspActive = false;
    state.sentinelSnapshot = new Map();
    dispatchStateChange();
  });
}
