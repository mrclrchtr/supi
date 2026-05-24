// LSP status command — /lsp-status overlay.
//
// Extracted from lsp.ts to keep each orchestration concern in its own module.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type LspRuntimeState, refreshProjectServers } from "../session/lsp-state.ts";
import { getLspDisabledMessage, loadLspSettings } from "../session/settings-registration.ts";
import { toggleLspStatusOverlay } from "../ui/ui.ts";

/**
 * Register the /lsp-status command that opens an LSP inspector overlay.
 */
export function registerLspStatusCommand(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.registerCommand("lsp-status", {
    description: "Show detected LSP servers, roots, open files, and diagnostics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const lspSettings = loadLspSettings(ctx.cwd);
      if (!lspSettings.enabled) {
        ctx.ui.notify(getLspDisabledMessage(ctx.cwd), "warning");
        return;
      }

      if (!state.manager) {
        ctx.ui.notify("LSP not initialized", "warning");
        return;
      }

      refreshProjectServers(state);
      toggleLspStatusOverlay(
        ctx,
        state.manager,
        state.inlineSeverity,
        state.inspector,
        state.projectServers,
      );
    },
  });
}
