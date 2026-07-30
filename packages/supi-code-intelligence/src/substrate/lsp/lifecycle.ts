// LSP lifecycle backed by the process-shared Workspace provider host.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { acquireWorkspaceProviderHost } from "../workspace-provider-host.ts";
import { LSP_STATE_CHANGE_EVENT, type LspAdapterState } from "./state.ts";

const STATE_CHANGE_EVENT = new Event(LSP_STATE_CHANGE_EVENT);

/** Poll interval (ms) for detecting server readiness transitions in the footer. */
const READINESS_POLL_MS = 2_000;

/** Acquire providers once per workspace and release them after the final Pi session ends. */
export function registerLspSessionLifecycle(
  pi: ExtensionAPI,
  state: LspAdapterState,
  onStarted?: (ctx: ExtensionContext) => void | Promise<void>,
): void {
  let readinessTimer: ReturnType<typeof setInterval> | null = null;
  let lastFingerprint = "";

  function fingerprint(): string {
    const servers = state.controller?.workspaceRuntime?.getProjectServers();
    if (!servers) return "";
    let ready = 0;
    let starting = 0;
    let error = 0;
    let unavailable = 0;
    let openFiles = 0;
    for (const s of servers) {
      openFiles += s.openFiles.length;
      if (s.status === "running" && s.ready) ready++;
      else if (s.status === "running") starting++;
      else if (s.status === "error") error++;
      else unavailable++;
    }
    return `${ready}:${starting}:${error}:${unavailable}:${openFiles}`;
  }

  function startReadinessPolling(): void {
    stopReadinessPolling();
    lastFingerprint = fingerprint();
    readinessTimer = setInterval(() => {
      if (state.controller?.kind !== "ready") return;
      const current = fingerprint();
      if (current === lastFingerprint) return;
      lastFingerprint = current;
      state.stateChanges.dispatchEvent(STATE_CHANGE_EVENT);
    }, READINESS_POLL_MS);
    readinessTimer.unref?.();
  }

  function stopReadinessPolling(): void {
    if (readinessTimer) {
      clearInterval(readinessTimer);
      readinessTimer = null;
    }
    lastFingerprint = "";
  }

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    await state.providerLease?.release();
    state.providerLease = null;
    state.controller = null;
    state.lspActive = false;
    state.sentinelSnapshot = new Map();
    stopReadinessPolling();

    const lease = await acquireWorkspaceProviderHost(ctx.cwd, {
      projectTrusted: ctx.isProjectTrusted(),
    });
    state.providerLease = lease;
    state.controller = lease.lspController;
    state.lspActive = lease.lspController?.kind === "ready";
    state.sentinelSnapshot = lease.sentinelSnapshot;
    await onStarted?.(ctx);

    // Dispatch initial server list so the footer shows starting servers immediately.
    state.stateChanges.dispatchEvent(STATE_CHANGE_EVENT);
    // Poll for readiness transitions (running → ready, errors, etc.).
    startReadinessPolling();
  });

  pi.on("session_shutdown", async () => {
    stopReadinessPolling();
    await state.providerLease?.release();
    state.providerLease = null;
    state.controller = null;
    state.lspActive = false;
    state.sentinelSnapshot = new Map();
  });
}
