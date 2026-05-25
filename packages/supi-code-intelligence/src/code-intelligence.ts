// Code Intelligence extension entry point — registers the focused code-intelligence tools.
// Provides architecture briefs, project maps, relationship tracing, impact assessment, and pattern search.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildArchitectureModel } from "./model.ts";
import { renderOverview } from "./presentation/markdown/overview.ts";
import { unwireProviders, wireLspProvider, wireTreeSitterProvider } from "./provider/wiring.ts";
import { registerCodeIntelligenceTools } from "./tool/register-tools.ts";
import { buildOverviewData } from "./use-case/build-overview.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

/**
 * Register the focused code-intelligence tools and inject a lightweight
 * architecture overview once per session.
 */
export default function codeIntelligenceExtension(pi: ExtensionAPI) {
  let hasInjectedOverview = false;
  let activeCwd: string | null = null;

  pi.on("session_start", (_event, ctx) => {
    hasInjectedOverview = false;
    activeCwd = ctx.cwd;

    // Wire up CodeProviders from LSP and Tree-sitter service registries.
    // These are async but fire-and-forget — the pending LSP provider
    // bridges the startup window.
    unwireProviders(ctx.cwd);
    void wireLspProvider(ctx.cwd);
    void wireTreeSitterProvider(ctx.cwd);

    // Scan active branch for existing overview to avoid duplicates on reload/resume
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

  registerCodeIntelligenceTools(pi);

  pi.on("session_shutdown", () => {
    if (activeCwd) {
      unwireProviders(activeCwd);
      activeCwd = null;
    }
  });
}
