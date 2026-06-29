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
import { unregisterLspFooterContribution } from "../../ui/footer.ts";
import type { LspAdapterState } from "./state.ts";

export function registerLspSessionLifecycle(pi: ExtensionAPI, state: LspAdapterState): void {
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const cwd = ctx.cwd;
    const runtime = getDefaultWorkspaceRuntime();

    if (state.controller) {
      await state.controller.shutdown();
      state.controller = null;
    }
    resetDiagnosticContext(state);
    state.lspActive = false;

    const lspSettings = loadLspSettings(cwd);
    // Always-on policy: `lsp.enabled` is deprecated and ignored. Keep reading
    // settings for severity/exclude data, but let LspRuntimeController decide
    // startup and per-language disables.
    state.inlineSeverity = lspSettings.severity;

    const controller = new LspRuntimeController(cwd, runtime);
    const result = await controller.start();

    if (result.kind === "ready") {
      state.controller = controller;
      state.lspActive = true;
      state.sentinelSnapshot = scanWorkspaceSentinels(cwd);
    } else {
      state.controller = null;
      resetDiagnosticContext(state);
      state.lspActive = false;
    }
  });

  pi.on("session_shutdown", async (_event, _ctx: ExtensionContext) => {
    if (state.controller) {
      await state.controller.shutdown();
      state.controller = null;
    }
    resetDiagnosticContext(state);
    state.lspActive = false;
    unregisterLspFooterContribution();
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
