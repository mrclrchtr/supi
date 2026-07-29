// LSP lifecycle backed by the process-shared Workspace provider host.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { unregisterLspFooterContribution } from "../../ui/footer.ts";
import { acquireWorkspaceProviderHost } from "../workspace-provider-host.ts";
import type { LspAdapterState } from "./state.ts";

/** Acquire providers once per workspace and release them after the final Pi session ends. */
export function registerLspSessionLifecycle(
  pi: ExtensionAPI,
  state: LspAdapterState,
  onStarted?: (ctx: ExtensionContext) => void | Promise<void>,
): void {
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
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
  });

  pi.on("session_shutdown", async () => {
    await state.providerLease?.release();
    state.providerLease = null;
    state.controller = null;
    state.lspActive = false;
    state.sentinelSnapshot = new Map();
    unregisterLspFooterContribution();
  });
}
