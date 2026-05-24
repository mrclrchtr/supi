// Diagnostic injection — injects outstanding LSP diagnostics into context before agent turns.

import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { pruneAndReorderContextMessages } from "@mrclrchtr/supi-core/api";
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import type { CodeIntelLspRuntimeState } from "./runtime-state.ts";

const LSP_CONTEXT_TYPE = "lsp-context";

/**
 * Register the before_agent_start handler that injects outstanding diagnostics.
 *
 * Avoids duplicate injections by tracking a fingerprint of the last injected
 * diagnostics. Uses a unique token (separate from the fingerprint) so the
 * context hook can prune stale messages even when diagnostics temporarily
 * disappear or go unchanged.
 */
export function registerLspDiagnosticInjectionHandler(
  pi: ExtensionAPI,
  state: CodeIntelLspRuntimeState,
): void {
  let lastFingerprint: string | null = null;
  let currentToken: string | null = null;
  let tokenCounter = 0;

  // Reset token on session start/shutdown
  pi.on("session_start", () => {
    lastFingerprint = null;
    currentToken = null;
    tokenCounter = 0;
  });

  pi.on("session_shutdown", () => {
    lastFingerprint = null;
    currentToken = null;
    tokenCounter = 0;
  });

  pi.on(
    "before_agent_start",
    async (_event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
      if (!state.lspActive || !state.controller) return;

      const lspState = getSessionLspService(ctx.cwd);
      if (lspState.kind !== "ready") return;

      const diagnostics = lspState.service.getOutstandingDiagnosticSummary(state.inlineSeverity);
      if (diagnostics.length === 0) {
        // No diagnostics — clear the token so the context hook can prune stale messages
        currentToken = null;
        return;
      }

      const content = formatDiagnosticsContext(diagnostics);

      // Skip injection if diagnostics haven't changed since last turn
      if (content === lastFingerprint) return;
      lastFingerprint = content;

      // Use a unique incrementing token separate from the content fingerprint
      tokenCounter++;
      currentToken = `lsp-context-${tokenCounter}`;

      return {
        message: {
          customType: LSP_CONTEXT_TYPE,
          display: false,
          content,
          details: { contextToken: currentToken },
        },
      };
    },
  );

  // Prune stale lsp-context messages before each LLM turn
  pi.on("context", async (event, _ctx) => {
    const pruned = pruneAndReorderContextMessages(event.messages, LSP_CONTEXT_TYPE, currentToken);
    return { messages: pruned };
  });
}

function formatDiagnosticsContext(
  diagnostics: Array<{
    file: string;
    total: number;
    errors: number;
    warnings: number;
    information: number;
    hints: number;
  }>,
): string {
  const lines: string[] = [];
  lines.push('<extension-context source="supi-lsp">');
  lines.push("Outstanding diagnostics — fix these before proceeding:");
  for (const entry of diagnostics) {
    const parts: string[] = [];
    if (entry.errors > 0) parts.push(`${entry.errors} error(s)`);
    if (entry.warnings > 0) parts.push(`${entry.warnings} warning(s)`);
    if (entry.information > 0) parts.push(`${entry.information} info`);
    if (entry.hints > 0) parts.push(`${entry.hints} hint(s)`);
    lines.push(`- ${entry.file}: ${parts.join(", ")}`);
  }
  lines.push("</extension-context>");
  return lines.join("\n");
}
