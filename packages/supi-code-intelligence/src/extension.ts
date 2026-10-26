// Code Intelligence extension entry point — registers the focused code-intelligence tools,
// shared provider lifecycle, settings, UI, and the unified /supi-ci-status command.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodeIntelligenceApp } from "./app/app.ts";
import { registerCodeIntelligenceSettings, resolveOverviewEnabled } from "./config.ts";
import { registerGradleObservations } from "./gradle/consent.ts";
import { reportWorkspaceBudget } from "./overview/budget.ts";
import { collectOverview } from "./overview/collect.ts";
import type { WorkspaceCodeIntelligenceSession } from "./session/session.ts";
import { registerLspSessionLifecycle } from "./substrate/lsp/lifecycle.ts";
import { registerWorkspaceRecoveryHandler } from "./substrate/lsp/recovery.ts";
import { registerLspSettings } from "./substrate/lsp/settings.ts";
import { createLspAdapterState } from "./substrate/lsp/state.ts";
import { registerCodeIntelligenceTools } from "./tool/register.ts";
import { registerLspFooterContribution } from "./ui/footer.ts";
import { registerCiStatusCommand } from "./ui/status-command.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

/** Register the full interactive Code Intelligence profile. */
export default function codeIntelligenceExtension(
  pi: ExtensionAPI,
  getOrCreateSession?: (cwd: string) => WorkspaceCodeIntelligenceSession,
  homeDir?: string,
) {
  const app = createCodeIntelligenceApp(pi);
  const lspState = createLspAdapterState();
  const gradle = registerGradleObservations(pi, { homeDir });

  registerCodeIntelligenceSettings(pi, homeDir);
  registerLspSettings(pi, homeDir);
  registerLspSessionLifecycle(
    pi,
    lspState,
    (ctx) => {
      const session = app.getSession(ctx.cwd);
      if (!session) return;
      session.attachLspController(lspState.controller);
      session.seedSentinelSnapshot(lspState.sentinelSnapshot);
      session.setProjectTrusted(ctx.isProjectTrusted());
      session.setHomeDir(homeDir);
      session.setGradleObserver(gradle.forContext(ctx));
      session.setAutomaticPathPolicy(lspState.providerLease?.automaticPathPolicy ?? null);
    },
    homeDir,
  );
  registerWorkspaceRecoveryHandler(pi, lspState);

  registerCodeIntelligenceTools(pi, (cwd) => {
    const session = getOrCreateSession?.(cwd) ?? app.getSession(cwd) ?? app.createSession(cwd);
    const lease = lspState.providerLease;
    if (lease?.cwd === cwd) {
      session.attachLspController(lspState.controller);
      session.setAutomaticPathPolicy(lease.automaticPathPolicy);
    }
    session.setHomeDir(homeDir);
    return session;
  });

  registerCiStatusCommand(pi, homeDir, {
    get: (cwd) =>
      lspState.providerLease?.cwd === cwd
        ? {
            lspController: lspState.controller,
            automaticPathPolicy: lspState.providerLease.automaticPathPolicy,
          }
        : { lspController: null, automaticPathPolicy: null },
  });
  const lspFooter = registerLspFooterContribution(pi, lspState);

  pi.on("session_shutdown", () => {
    lspFooter.dispose();
  });

  pi.on("session_start", (_event, ctx) => {
    app
      .getSession(ctx.cwd)
      ?.setOverviewEnabledOnce(resolveOverviewEnabled(ctx.cwd, ctx.isProjectTrusted(), homeDir));
  });

  pi.on("before_agent_start", (event, ctx) => {
    const session = app.getSession(ctx.cwd) ?? app.createSession(ctx.cwd);
    session.captureNativeInstructionPaths(event.systemPromptOptions.contextFiles ?? []);
    session.setHomeDir(homeDir);
    session.setGradleObserver(gradle.forContext(ctx));
    if (!session.hasPinnedOverview()) {
      session.setOverviewEnabledOnce(
        resolveOverviewEnabled(ctx.cwd, ctx.isProjectTrusted(), homeDir),
      );
    }
  });

  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      const session = app.getSession(ctx.cwd);
      if (!session) return;
      if (!session.hasPinnedOverview()) {
        session.setOverviewEnabledOnce(
          resolveOverviewEnabled(ctx.cwd, ctx.isProjectTrusted(), homeDir),
        );
      }
      if (!session.claimOverviewInjection()) return;

      try {
        const overview = await collectOverview(
          ctx.cwd,
          ctx.isProjectTrusted(),
          homeDir,
          gradle.forContext(ctx),
        );
        if (!overview) {
          session.restoreOverviewInjection(false);
          return;
        }
        reportWorkspaceBudget(ctx, overview.warning);
        return {
          message: { customType: OVERVIEW_CUSTOM_TYPE, display: false, content: overview.content },
        };
      } catch (error) {
        session.restoreOverviewInjection(false);
        throw error;
      }
    },
  );
}
