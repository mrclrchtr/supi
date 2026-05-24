// Code Intelligence extension entry point — registers code_*, lsp_*, and
// tree_sitter_* tools. Provides architecture briefs, project maps,
// relationship tracing, impact assessment, and pattern search.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildArchitectureModel } from "./architecture.ts";
import { generateOverview } from "./brief.ts";
import { registerLspDiagnosticInjectionHandler } from "./lsp/diagnostic-injection.ts";
import { registerLspMessageRenderer } from "./lsp/lsp-message-renderer.ts";
import type { CodeIntelLspRuntimeState } from "./lsp/runtime-state.ts";
import { createCodeIntelLspRuntimeState } from "./lsp/runtime-state.ts";
import { registerLspSessionLifecycleHandlers } from "./lsp/session-lifecycle.ts";
import { registerLspConfigSettings } from "./lsp/settings.ts";
import { registerLspToolOverrides } from "./lsp/tool-overrides.ts";
import { registerCodeIntelligenceTools } from "./tool/register-tools.ts";
import {
  type CodeIntelTsState,
  createCodeIntelTsState,
  registerTsSessionLifecycleHandlers,
} from "./tree-sitter/session-lifecycle.ts";
import { registerCodeIntelligenceStatusCommand } from "./ui/code-intelligence-status-command.ts";

const OVERVIEW_CUSTOM_TYPE = "code-intelligence-overview";

/**
 * Register the focused code-intelligence tools and inject a lightweight
 * architecture overview once per session.
 */
export default function codeIntelligenceExtension(pi: ExtensionAPI) {
  let hasInjectedOverview = false;
  const lspState: CodeIntelLspRuntimeState = createCodeIntelLspRuntimeState();

  // ── LSP settings (registered once, stateless) ──────────────────────
  registerLspConfigSettings();

  // ── LSP tool overrides (registered once) ───────────────────────────
  registerLspToolOverrides(pi, lspState);

  // ── LSP session lifecycle (wired to pi events) ─────────────────────
  registerLspSessionLifecycleHandlers(pi, lspState);

  // ── LSP diagnostic injection (wired to pi events) ──────────────────
  registerLspDiagnosticInjectionHandler(pi, lspState);

  // ── LSP custom message renderer (registered once) ──────────────────
  registerLspMessageRenderer(pi);

  // ── Tree-sitter session lifecycle ────────────────────────────────
  const tsState: CodeIntelTsState = createCodeIntelTsState();
  registerTsSessionLifecycleHandlers(pi, tsState);

  // ── Unified status command ─────────────────────────────────────────
  registerCodeIntelligenceStatusCommand(pi);

  // ── Code tools and overview injection ──────────────────────────────

  pi.on("session_start", (_event, ctx) => {
    hasInjectedOverview = false;

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

      const overview = generateOverview(model);
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
}
