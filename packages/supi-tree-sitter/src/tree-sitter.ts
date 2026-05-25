// Tree-sitter extension entry point — registers 6 focused tree_sitter_* tools.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { TreeSitterRuntime } from "./session/runtime.ts";
import {
  registerTreeSitterCapabilities,
  unregisterTreeSitterCapabilities,
} from "./session/runtime-registration.ts";
import {
  clearSessionTreeSitterService,
  setSessionTreeSitterService,
} from "./session/service-registry.ts";
import { createTreeSitterService } from "./session/session.ts";
import { registerFocusedTreeSitterTools } from "./tool/register-tools.ts";

export default function treeSitterExtension(pi: ExtensionAPI) {
  let treeSitterRuntime: TreeSitterRuntime | undefined;
  let activeCwd: string | null = null;
  const workspaceRuntime = getDefaultWorkspaceRuntime();

  registerFocusedTreeSitterTools(pi, () => treeSitterRuntime);

  pi.on("session_start", (_event, ctx) => {
    if (treeSitterRuntime && activeCwd) {
      unregisterTreeSitterCapabilities(workspaceRuntime, activeCwd);
      clearSessionTreeSitterService(activeCwd);
      treeSitterRuntime.dispose();
    }

    activeCwd = ctx.cwd;
    treeSitterRuntime = new TreeSitterRuntime(ctx.cwd);
    const service = createTreeSitterService(treeSitterRuntime);
    setSessionTreeSitterService(ctx.cwd, service);
    registerTreeSitterCapabilities(workspaceRuntime, ctx.cwd, service);
  });

  pi.on("session_shutdown", () => {
    if (activeCwd) {
      unregisterTreeSitterCapabilities(workspaceRuntime, activeCwd);
      clearSessionTreeSitterService(activeCwd);
    }
    treeSitterRuntime?.dispose();
    treeSitterRuntime = undefined;
    activeCwd = null;
  });
}
