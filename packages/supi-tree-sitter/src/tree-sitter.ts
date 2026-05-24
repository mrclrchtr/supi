// Tree-sitter extension entry point — registers 6 focused tree_sitter_* tools.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TreeSitterRuntime } from "./session/runtime.ts";
import {
  clearSessionTreeSitterService,
  setSessionTreeSitterService,
} from "./session/service-registry.ts";
import { createTreeSitterService } from "./session/session.ts";
import { registerFocusedTreeSitterTools } from "./tool/register-tools.ts";

export default function treeSitterExtension(pi: ExtensionAPI) {
  let runtime: TreeSitterRuntime | undefined;
  let activeCwd: string | null = null;

  registerFocusedTreeSitterTools(pi, () => runtime);

  pi.on("session_start", (_event, ctx) => {
    if (runtime && activeCwd) {
      clearSessionTreeSitterService(activeCwd);
      runtime.dispose();
    }

    activeCwd = ctx.cwd;
    runtime = new TreeSitterRuntime(ctx.cwd);
    setSessionTreeSitterService(ctx.cwd, createTreeSitterService(runtime));
  });

  pi.on("session_shutdown", () => {
    if (activeCwd) {
      clearSessionTreeSitterService(activeCwd);
    }
    runtime?.dispose();
    runtime = undefined;
    activeCwd = null;
  });
}
