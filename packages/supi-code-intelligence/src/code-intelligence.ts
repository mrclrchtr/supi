// Code Intelligence extension entry point — registers the focused code-intelligence tools,
// the LSP adapter with diagnostics, overrides, and settings, and the unified /ci-status command.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodeIntelligenceApp } from "./app/create-code-intelligence-app.ts";
import { registerDiagnosticInjectionHandlers } from "./lsp/diagnostic-injection.ts";
import { defaultLspToolPromptSurfaces } from "./lsp/guidance.ts";
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
import { registerLspMessageRenderer } from "./ui/lsp-message-renderer.ts";
import { buildOverviewData } from "./use-case/build-overview.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

export default function codeIntelligenceExtension(pi: ExtensionAPI) {
  const app = createCodeIntelligenceApp(pi);

  const lspState = createLspAdapterState();
  const tsState = createTsAdapterState();

  // ── Substrate wiring ──────────────────────────────────────────────
  registerLspSettings();
  registerLspSessionLifecycle(pi, lspState);
  registerLspAwareToolOverrides(pi, lspState);
  registerDiagnosticInjectionHandlers(pi, lspState);
  registerWorkspaceRecoveryHandler(pi, lspState);
  registerTsSessionLifecycle(pi, tsState);

  // ── Tool registration ─────────────────────────────────────────────
  registerCodeIntelligenceTools(pi);
  registerLspTools(pi, defaultLspToolPromptSurfaces);

  // ── UI registration ───────────────────────────────────────────────
  registerLspMessageRenderer(pi);
  registerCiStatusCommand(pi);

  // ── Overview injection — uses the app-managed session state ────────
  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      const session = app.getSession(ctx.cwd);
      if (!session) return;
      if (session.hasInjectedOverview) return;
      session.hasInjectedOverview = true;

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
}
