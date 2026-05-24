// LSP session lifecycle handler for the umbrella extension adapter.
//
// Owns the pi event wiring for starting/stopping the LSP runtime via
// the library-level `LspRuntimeController`.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { LspRuntimeController, loadLspSettings } from "@mrclrchtr/supi-lsp/api";
import { buildLspToolPromptSurfaces } from "./guidance.ts";
import { ensureLspToolsActive, registerLspTools, removeLspTools } from "./register-tools.ts";
import type { CodeIntelLspRuntimeState } from "./runtime-state.ts";

/**
 * Register session lifecycle handlers for the LSP adapter.
 *
 * - `session_start`: creates/restarts the library controller, starts LSP, registers tools.
 * - `session_shutdown`: tears down the controller.
 * - `agent_end`: refreshes project server info.
 */
export function registerLspSessionLifecycleHandlers(
  pi: ExtensionAPI,
  state: CodeIntelLspRuntimeState,
): void {
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    // Clean up any previous session
    if (state.controller) {
      await state.controller.stop();
    }

    const cwd = ctx.cwd;
    const lspSettings = loadLspSettings(cwd);

    if (!lspSettings.enabled) {
      state.lspActive = false;
      state.controller = null;
      removeLspTools(pi);
      return;
    }

    state.inlineSeverity = lspSettings.severity;
    state.controller = new LspRuntimeController();

    const result = await state.controller.start(cwd);

    if (result.kind === "disabled") {
      state.lspActive = false;
      state.controller = null;
      removeLspTools(pi);
      return;
    }

    // Ready — register tools and update state
    state.projectServers = result.projectServers;
    state.lspActive = true;

    registerLspTools(pi, buildLspToolPromptSurfaces(result.projectServers, cwd));
    ensureLspToolsActive(pi);
  });

  pi.on("session_shutdown", async () => {
    if (state.controller) {
      await state.controller.stop();
      state.controller = null;
    }
    state.lspActive = false;
    state.projectServers = [];
  });

  pi.on("agent_end", async () => {
    if (state.controller?.manager) {
      state.projectServers = state.controller.getProjectServers();
    }
  });
}
