// Code Intelligence extension entry point — registers the focused code-intelligence tools,
// shared provider lifecycle, settings, UI, and the unified /supi-ci-status command.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildArchitectureModel } from "./analysis/architecture/discovery.ts";
import { createCodeIntelligenceApp } from "./app/app.ts";
import { registerCodeIntelligenceSettings } from "./config.ts";
import type { WorkspaceCodeIntelligenceSession } from "./session/session.ts";
import { registerLspSessionLifecycle } from "./substrate/lsp/lifecycle.ts";
import { registerWorkspaceRecoveryHandler } from "./substrate/lsp/recovery.ts";
import { registerLspSettings } from "./substrate/lsp/settings.ts";
import { createLspAdapterState } from "./substrate/lsp/state.ts";
import { registerCodeIntelligenceTools } from "./tool/register.ts";
import { registerLspFooterContribution } from "./ui/footer.ts";
import { estimateTokens, OVERVIEW_TOKEN_BUDGET, renderOverview } from "./ui/markdown/overview.ts";
import { buildOverviewData } from "./ui/markdown/overview-data.ts";
import { registerCiStatusCommand } from "./ui/status-command.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

/** Register the full interactive Code Intelligence profile. */
export default function codeIntelligenceExtension(
  pi: ExtensionAPI,
  getOrCreateSession?: (cwd: string) => WorkspaceCodeIntelligenceSession,
) {
  const app = createCodeIntelligenceApp(pi);
  const lspState = createLspAdapterState();

  registerCodeIntelligenceSettings(pi);
  registerLspSettings(pi);
  registerLspSessionLifecycle(pi, lspState, (ctx) => {
    const session = app.getSession(ctx.cwd);
    if (!session) return;
    session.attachLspController(lspState.controller);
    session.seedSentinelSnapshot(lspState.sentinelSnapshot);
    session.setProjectTrusted(ctx.isProjectTrusted());
  });
  registerWorkspaceRecoveryHandler(pi, lspState);

  registerCodeIntelligenceTools(
    pi,
    getOrCreateSession ?? ((cwd) => app.getSession(cwd) ?? app.createSession(cwd)),
  );

  registerCiStatusCommand(pi);
  const lspFooter = registerLspFooterContribution(pi, lspState);

  pi.on("session_shutdown", () => {
    lspFooter.dispose();
  });

  pi.on("before_agent_start", (event, ctx) => {
    const session = app.getSession(ctx.cwd) ?? app.createSession(ctx.cwd);
    session.captureNativeInstructionPaths(event.systemPromptOptions.contextFiles ?? []);
  });

  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      const session = app.getSession(ctx.cwd);
      if (!session?.claimOverviewInjection()) return;

      const model = await buildArchitectureModel(ctx.cwd);
      if (model.modules.length === 0) return;

      const data = buildOverviewData(model);
      if (!data) return;

      const overview = renderOverview(data);
      if (!overview) return;

      const estimatedTokens = estimateTokens(overview);
      if (estimatedTokens > OVERVIEW_TOKEN_BUDGET) {
        pi.events.emit("supi:debug", {
          source: "supi-code-intelligence",
          level: "warning",
          category: "overview",
          message: `Overview exceeds soft token budget: ${estimatedTokens} tokens (budget: ${OVERVIEW_TOKEN_BUDGET})`,
        });
      }

      return {
        message: { customType: OVERVIEW_CUSTOM_TYPE, display: false, content: overview },
      };
    },
  );
}
