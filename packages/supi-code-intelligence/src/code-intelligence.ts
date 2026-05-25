// Code Intelligence extension entry point — registers the focused code-intelligence tools,
// the LSP adapter with diagnostics, overrides, and settings, and the unified /ci-status command.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDiagnosticInjectionHandlers } from "./lsp/diagnostic-injection.ts";
import { defaultLspToolPromptSurfaces } from "./lsp/guidance.ts";
import { registerLspMessageRenderer } from "./lsp/lsp-message-renderer.ts";
import { registerLspTools } from "./lsp/register-tools.ts";
import { createLspAdapterState } from "./lsp/runtime-state.ts";
import { registerLspSessionLifecycle } from "./lsp/session-lifecycle.ts";
import { registerLspSettings } from "./lsp/settings.ts";
import { registerLspAwareToolOverrides } from "./lsp/tool-overrides.ts";
import { registerWorkspaceRecoveryHandler } from "./lsp/workspace-recovery.ts";
import { buildArchitectureModel } from "./model.ts";
import { renderOverview } from "./presentation/markdown/overview.ts";
import { registerCodeIntelligenceTools } from "./tool/register-tools.ts";
import {
  createTsAdapterState,
  registerTsSessionLifecycle,
} from "./tree-sitter/session-lifecycle.ts";
import { registerCiStatusCommand } from "./ui/code-intelligence-status-command.ts";
import { buildOverviewData } from "./use-case/build-overview.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

export default function codeIntelligenceExtension(pi: ExtensionAPI) {
  let hasInjectedOverview = false;
  let _activeCwd: string | null = null;

  // Adapter states
  const lspState = createLspAdapterState();
  const tsState = createTsAdapterState();

  // Register all surfaces
  registerLspSettings();
  registerCodeIntelligenceTools(pi);
  registerLspTools(pi, defaultLspToolPromptSurfaces);
  registerLspSessionLifecycle(pi, lspState);
  registerLspAwareToolOverrides(pi, lspState);
  registerDiagnosticInjectionHandlers(pi, lspState);
  registerWorkspaceRecoveryHandler(pi, lspState);
  registerLspMessageRenderer(pi);
  registerTsSessionLifecycle(pi, tsState);
  registerCiStatusCommand(pi);

  pi.on("session_start", (_event, ctx) => {
    hasInjectedOverview = false;
    _activeCwd = ctx.cwd;

    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      if (entry.type === "custom_message" && entry.customType === OVERVIEW_CUSTOM_TYPE) {
        hasInjectedOverview = true;
        break;
      }
    }
  });

  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      if (hasInjectedOverview) return;
      hasInjectedOverview = true;

      const model = await buildArchitectureModel(ctx.cwd);
      if (!model || model.modules.length === 0) return;

      const data = buildOverviewData(model);
      if (!data) return;

      const overview = renderOverview(data);
      if (!overview) return;

      return {
        message: {
          customType: OVERVIEW_CUSTOM_TYPE,
          display: false,
          content: overview,
        },
      };
    },
  );

  pi.on("session_shutdown", () => {
    _activeCwd = null;
  });
}
