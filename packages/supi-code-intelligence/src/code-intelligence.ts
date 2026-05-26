// Code Intelligence extension entry point — registers the focused code-intelligence tools,
// the LSP adapter with diagnostics, overrides, and settings, and the unified /ci-status command.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodeIntelligenceApp } from "./app/create-code-intelligence-app.ts";
import { buildArchitectureModel } from "./model.ts";
import { renderOverview } from "./presentation/markdown/overview.ts";
import { registerDiagnosticInjectionHandlers } from "./substrate/semantic/diagnostics.ts";
import { registerLspSessionLifecycle } from "./substrate/semantic/lifecycle.ts";
import { registerLspAwareToolOverrides } from "./substrate/semantic/overrides.ts";
import { registerWorkspaceRecoveryHandler } from "./substrate/semantic/recovery.ts";
import { registerLspSettings } from "./substrate/semantic/settings.ts";
import { createLspAdapterState } from "./substrate/semantic/state.ts";
import { registerTsSessionLifecycle } from "./substrate/structural/lifecycle.ts";
import { createTsAdapterState } from "./substrate/structural/state.ts";
import { registerCodeIntelligenceTools } from "./tool/families/code/register.ts";
import { defaultLspToolPromptSurfaces } from "./tool/families/lsp/guidance.ts";
import { registerLspTools } from "./tool/families/lsp/register.ts";
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
