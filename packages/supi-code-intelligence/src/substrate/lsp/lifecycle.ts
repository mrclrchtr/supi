// LSP session lifecycle — uses LspRuntimeController from @mrclrchtr/supi-lsp/api.
//
// Registers session_start and session_shutdown handlers that manage
// the LspRuntimeController lifecycle.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { LspRuntimeController, scanWorkspaceSentinels } from "@mrclrchtr/supi-lsp/api";
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
    state.lspActive = false;

    // Project-local LSP configuration may define custom commands; defer
    // until the project is trusted so an untrusted repository cannot control
    // spawned processes.
    if (!ctx.isProjectTrusted()) {
      state.controller = null;
      state.lspActive = false;
      return;
    }

    const controller = new LspRuntimeController(cwd, runtime);
    const result = await controller.start();

    if (result.kind === "ready") {
      state.controller = controller;
      state.lspActive = true;
      state.sentinelSnapshot = scanWorkspaceSentinels(cwd);
    } else {
      state.controller = null;
      state.lspActive = false;
    }
  });

  pi.on("session_shutdown", async (_event, _ctx: ExtensionContext) => {
    if (state.controller) {
      await state.controller.shutdown();
      state.controller = null;
    }
    state.lspActive = false;
    unregisterLspFooterContribution();
  });
}
