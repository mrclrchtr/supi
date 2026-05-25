// LSP Extension for pi — wires together the expert semantic toolset and all
// event/behaviour handlers. Handler registration is delegated to focused
// modules so each orchestration concern lives in its own file.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { registerDiagnosticInjectionHandlers } from "./handlers/diagnostic-injection.ts";
import { registerSessionLifecycleHandlers } from "./handlers/session-lifecycle.ts";
import { registerLspStatusCommand } from "./handlers/status-command.ts";
import { registerWorkspaceRecoveryHandler } from "./handlers/workspace-recovery.ts";
import { createRuntimeState } from "./session/lsp-state.ts";
import { registerLspSettings } from "./session/settings-registration.ts";
import { registerTreePersistHandlers } from "./session/tree-persist.ts";
import { defaultLspToolPromptSurfaces } from "./tool/guidance.ts";
import { registerLspAwareToolOverrides } from "./tool/overrides.ts";
import { registerLspTools } from "./tool/register-tools.ts";
import { registerLspMessageRenderer } from "./ui/renderer.ts";

export default function lspExtension(pi: ExtensionAPI) {
  registerLspSettings();
  const state = createRuntimeState();
  const runtime = getDefaultWorkspaceRuntime();

  registerLspAwareToolOverrides(pi, {
    getInlineSeverity: () => state.inlineSeverity,
    getManager: () => state.manager,
    isActive: () => state.lspActive,
  });

  registerLspTools(pi, defaultLspToolPromptSurfaces);
  registerSessionLifecycleHandlers(pi, state, runtime);
  registerDiagnosticInjectionHandlers(pi, state);
  registerWorkspaceRecoveryHandler(pi, state);
  registerTreePersistHandlers(pi, state);
  registerLspStatusCommand(pi, state);
  registerLspMessageRenderer(pi);
}
