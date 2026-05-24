// Tree-sitter session lifecycle handler for the umbrella extension adapter.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TreeSitterRuntimeController } from "@mrclrchtr/supi-tree-sitter/api";
import { buildTsToolPromptSurfaces } from "./guidance.ts";
import { registerTsTools } from "./register-tools.ts";

/** In-memory state for the umbrella's tree-sitter adapter. */
export interface CodeIntelTsState {
  controller: TreeSitterRuntimeController | null;
}

export function createCodeIntelTsState(): CodeIntelTsState {
  return { controller: null };
}

/**
 * Register tree-sitter session lifecycle handlers.
 *
 * - `session_start`: starts the tree-sitter runtime and registers tools.
 * - `session_shutdown`: tears down the controller.
 */
export function registerTsSessionLifecycleHandlers(
  pi: ExtensionAPI,
  state: CodeIntelTsState,
): void {
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    // Clean up any previous session
    if (state.controller) {
      await state.controller.stop();
    }

    state.controller = new TreeSitterRuntimeController();
    await state.controller.start(ctx.cwd);

    registerTsTools(pi, buildTsToolPromptSurfaces());
  });

  pi.on("session_shutdown", async () => {
    if (state.controller) {
      await state.controller.stop();
      state.controller = null;
    }
  });
}
