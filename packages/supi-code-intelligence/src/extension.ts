// Code Intelligence extension entry point — registers the focused code-intelligence tools,
// the LSP adapter with diagnostics, overrides, and settings, and the unified /supi-ci-status command.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildArchitectureModel } from "./analysis/architecture/discovery.ts";
import {
  evaluateCoverageWarnings,
  gatherCoverageEvalInput,
} from "./analysis/coverage/coverage-warnings.ts";
import { createCodeIntelligenceApp } from "./app/app.ts";
import type { WorkspaceCodeIntelligenceSession } from "./session/session.ts";
import { registerDiagnosticInjectionHandlers } from "./substrate/lsp/diagnostic-injection.ts";
import { registerLspSessionLifecycle } from "./substrate/lsp/lifecycle.ts";
import { registerLspAwareToolOverrides } from "./substrate/lsp/overrides.ts";
import { registerWorkspaceRecoveryHandler } from "./substrate/lsp/recovery.ts";
import { registerLspSettings } from "./substrate/lsp/settings.ts";
import { createLspAdapterState } from "./substrate/lsp/state.ts";
import {
  createTsAdapterState,
  registerTsSessionLifecycle,
} from "./substrate/tree-sitter/lifecycle.ts";
import { registerCodeIntelligenceTools } from "./tool/register.ts";
import { registerLspFooterContribution } from "./ui/footer.ts";
import { renderOverview } from "./ui/markdown/overview.ts";
import { buildOverviewData } from "./ui/markdown/overview-data.ts";
import { registerLspMessageRenderer } from "./ui/message-renderer.ts";
import { registerCiStatusCommand } from "./ui/status-command.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

export default function codeIntelligenceExtension(
  pi: ExtensionAPI,
  getOrCreateSession?: (cwd: string) => WorkspaceCodeIntelligenceSession,
) {
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

  // ── Attach controller refs to sessions on startup (ADR 0008) ──────
  pi.on("session_start", (_event, ctx) => {
    const session = app.getSession(ctx.cwd);
    if (!session) return;
    if (lspState.controller) session.lspController = lspState.controller;
    if (tsState.controller) session.tsController = tsState.controller;
  });

  // ── Tool registration ─────────────────────────────────────────────
  registerCodeIntelligenceTools(
    pi,
    getOrCreateSession ?? ((cwd) => app.getSession(cwd) ?? app.createSession(cwd)),
  );

  // ── UI registration ───────────────────────────────────────────────
  registerLspMessageRenderer(pi);
  registerCiStatusCommand(pi);
  registerLspFooterContribution(lspState);

  // ── Coverage warning emission ─────────────────────────────────────
  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      const session = app.getSession(ctx.cwd);
      if (!session) return;

      const report = evaluateCoverageWarnings(
        gatherCoverageEvalInput(ctx.cwd, session.lspController),
      );
      const pending = session.coverageWarningState.getPendingWarnings(report);
      if (pending.length === 0) return;

      const lines = [
        '<extension-context source="supi-code-intelligence">',
        "Code intelligence coverage is degraded:",
      ];
      for (const w of pending) {
        const lang = w.language ? `[${w.language}] ` : "";
        const detail = w.detail ? ` — ${w.detail}` : "";
        lines.push(`- ${lang}${w.message}${detail}`);
      }
      lines.push("</extension-context>");
      const warningContext = lines.join("\n");

      return {
        message: {
          customType: "code-intelligence-coverage",
          display: true,
          content: warningContext,
        },
        systemPrompt:
          (await ctx.getSystemPrompt()) +
          `\n\nThe code intelligence stack has degraded coverage. This means some code-understanding tools (code_* tools) may return limited or structural-only information. The agent should still attempt using them, but be aware that semantic coverage for some languages may be unavailable.`,
      };
    },
  );

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
