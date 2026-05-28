// LSP session lifecycle — uses LspRuntimeController from @mrclrchtr/supi-lsp/api.
//
// Registers session_start and session_shutdown handlers that manage
// the LspRuntimeController lifecycle.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import {
  LspRuntimeController,
  loadLspSettings,
  scanWorkspaceSentinels,
} from "@mrclrchtr/supi-lsp/api";
import type { LspAdapterState } from "./runtime-state.ts";

export function registerLspSessionLifecycle(pi: ExtensionAPI, state: LspAdapterState): void {
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const cwd = ctx.cwd;
    const runtime = getDefaultWorkspaceRuntime();

    if (state.controller) {
      await state.controller.shutdown();
    }

    const lspSettings = loadLspSettings(cwd);
    if (!lspSettings.enabled) {
      resetDiagnosticContext(state);
      state.lspActive = false;
      return;
    }

    state.inlineSeverity = lspSettings.severity;

    const controller = new LspRuntimeController(cwd, runtime);
    const result = await controller.start();

    if (result.kind === "ready") {
      state.controller = controller;
      state.lspActive = true;
      state.sentinelSnapshot = scanWorkspaceSentinels(cwd);
    } else {
      resetDiagnosticContext(state);
      state.lspActive = false;
    }
  });

  pi.on("session_shutdown", async () => {
    if (state.controller) {
      await state.controller.shutdown();
      state.controller = null;
    }
    resetDiagnosticContext(state);
    state.lspActive = false;
  });
}

/** Clear diagnostic context fields that could leak across sessions. */
function resetDiagnosticContext(state: LspAdapterState): void {
  state.currentContextToken = null;
  state.lastDiagnosticsFingerprint = null;
  state.staleSuspected = false;
  state.lastWorkspaceChangeAt = 0;
  state.contextCounter = 0;
}
