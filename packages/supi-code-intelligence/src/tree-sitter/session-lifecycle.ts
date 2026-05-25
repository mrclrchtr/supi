// Tree-sitter session lifecycle — uses TreeSitterRuntimeController from @mrclrchtr/supi-tree-sitter/api.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { TreeSitterRuntimeController } from "@mrclrchtr/supi-tree-sitter/api";
import { defaultTsToolPromptSurfaces } from "./guidance.ts";
import { registerTsTools } from "./register-tools.ts";

/**
 * Tree-sitter adapter state for the umbrella extension.
 */
export interface TsAdapterState {
  controller: TreeSitterRuntimeController | null;
}

export function createTsAdapterState(): TsAdapterState {
  return { controller: null };
}

/**
 * Register Tree-sitter session lifecycle handlers.
 *
 * - session_start: creates TreeSitterRuntimeController, starts it, registers tools
 * - session_shutdown: shuts down the controller
 */
export function registerTsSessionLifecycle(pi: ExtensionAPI, state: TsAdapterState): void {
  function getRuntime() {
    return state.controller?.runtime ?? undefined;
  }

  // Register tools eagerly with a thunk for the runtime
  registerTsTools(pi, getRuntime, defaultTsToolPromptSurfaces);

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const cwd = ctx.cwd;
    const runtime = getDefaultWorkspaceRuntime();

    // Shut down any existing controller
    if (state.controller) {
      await state.controller.shutdown();
    }

    const controller = new TreeSitterRuntimeController(cwd, runtime);
    const result = await controller.start();

    if (result.kind === "ready") {
      state.controller = controller;
    }
  });

  pi.on("session_shutdown", async () => {
    if (state.controller) {
      await state.controller.shutdown();
      state.controller = null;
    }
  });
}
