// Code Intelligence extension entry point — registers the focused code-intelligence tools,
// the LSP adapter with diagnostics, overrides, and settings, and the unified /supi-ci-status command.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildArchitectureModel } from "./analysis/architecture/discovery.ts";
import { createCodeIntelligenceApp } from "./app/app.ts";
import { registerCodeIntelligenceSettings } from "./config.ts";
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
const PROCESS_EXIT_SAFETY_NET = Symbol.for("supi-code-intelligence/process-exit-safety-net");

interface ProcessExitSafetyNet {
  cleanup: (() => void) | null;
  handlerRegistered: boolean;
  handler: () => void;
}

/**
 * Keep one process-exit listener across `/reload` extension instances.
 * Pi hosts one active extension API per process; replacing its cleanup callback
 * prevents old adapter state from being retained after reload.
 */
function registerProcessExitSafetyNet(cleanup: () => void): () => void {
  const host = globalThis as Record<symbol, ProcessExitSafetyNet | undefined>;
  const safetyNet = host[PROCESS_EXIT_SAFETY_NET] ?? createProcessExitSafetyNet();
  host[PROCESS_EXIT_SAFETY_NET] = safetyNet;

  safetyNet.cleanup = cleanup;
  if (!safetyNet.handlerRegistered) {
    process.once("exit", safetyNet.handler);
    safetyNet.handlerRegistered = true;
  }

  return () => {
    if (safetyNet.cleanup !== cleanup) return;
    safetyNet.cleanup = null;
    if (!safetyNet.handlerRegistered) return;
    process.off("exit", safetyNet.handler);
    safetyNet.handlerRegistered = false;
  };
}

function createProcessExitSafetyNet(): ProcessExitSafetyNet {
  const safetyNet: ProcessExitSafetyNet = {
    cleanup: null,
    handlerRegistered: false,
    handler: () => {},
  };
  safetyNet.handler = () => {
    safetyNet.handlerRegistered = false;
    const activeCleanup = safetyNet.cleanup;
    safetyNet.cleanup = null;
    activeCleanup?.();
  };
  return safetyNet;
}

export default function codeIntelligenceExtension(
  pi: ExtensionAPI,
  getOrCreateSession?: (cwd: string) => WorkspaceCodeIntelligenceSession,
) {
  const app = createCodeIntelligenceApp(pi);

  const lspState = createLspAdapterState();
  const tsState = createTsAdapterState();

  // ── Substrate wiring ──────────────────────────────────────────────
  registerCodeIntelligenceSettings(pi);
  registerLspSettings(pi);
  registerLspSessionLifecycle(pi, lspState);
  registerLspAwareToolOverrides(pi, lspState);
  registerDiagnosticInjectionHandlers(pi, lspState);
  registerWorkspaceRecoveryHandler(pi, lspState);
  registerTsSessionLifecycle(pi, tsState);

  // ── Attach controller refs to sessions on startup (ADR 0008) ──────
  pi.on("session_start", (_event, ctx) => {
    const session = app.getSession(ctx.cwd);
    if (!session) return;
    session.attachLspController(lspState.controller);
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

  // ── Native context path capture for instruction-file dedup ─────────
  pi.on("before_agent_start", (event, ctx) => {
    const session = app.getSession(ctx.cwd) ?? app.createSession(ctx.cwd);
    session.captureNativeInstructionPaths(event.systemPromptOptions.contextFiles ?? []);
  });

  // ── Capability Warning emission ──────────────────────────────────
  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      const session = app.getSession(ctx.cwd);
      if (!session) return;

      const pending = session.pendingCapabilityWarnings();
      if (pending.length === 0) return;

      const lines = [
        '<extension-context source="supi-code-intelligence">',
        "Code intelligence Capability Warnings:",
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
          customType: "code-intelligence-capability-warnings",
          display: true,
          content: warningContext,
        },
        systemPrompt:
          (await ctx.getSystemPrompt()) +
          "\n\nThe code intelligence stack reports Capability Warnings. Some code_* tools may return limited or structural-only information. Continue using them, but account for unavailable semantic or structural analysis named by the warnings.",
      };
    },
  );

  // ── Overview injection — uses the app-managed session state ────────
  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      const session = app.getSession(ctx.cwd);
      if (!session) return;
      if (!session.claimOverviewInjection()) return;

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

  // ── Process-exit safety net ─────────────────────────────────────────
  let cleaningUp = false;
  const unregisterExitSafetyNet = registerProcessExitSafetyNet(() => {
    if (cleaningUp) return;
    cleaningUp = true;
    // Exit handlers cannot await. Controller shutdown begins synchronous
    // process cleanup before its first await.
    void lspState.controller?.shutdown();
    void tsState.controller?.shutdown();
  });
  pi.on("session_shutdown", unregisterExitSafetyNet);
}
