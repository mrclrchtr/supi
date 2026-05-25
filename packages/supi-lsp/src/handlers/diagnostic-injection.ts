// Diagnostic injection handlers — before_agent_start and context.
//
// Extracted from lsp.ts to keep each orchestration concern in its own module.

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { pruneAndReorderContextMessages, restorePromptContent } from "@mrclrchtr/supi-core/context";
import type { Diagnostic } from "../config/types.ts";
import {
  diagnosticsContextFingerprint,
  formatDiagnosticsContext,
  MAX_DETAILED_DIAGNOSTICS,
} from "../diagnostics/diagnostic-context.ts";
import { formatDiagnosticsDisplayContent } from "../diagnostics/diagnostic-display.ts";
import { assessStaleDiagnostics } from "../diagnostics/stale-diagnostics.ts";
// Force re-open files with module-resolution errors
import { forceResyncStaleModuleFiles } from "../manager/manager-stale-resync.ts";
import type { OutstandingDiagnosticSummaryEntry } from "../manager/manager-types.ts";
import {
  ensureLspToolsActive,
  type LspRuntimeState,
  refreshProjectServers,
  removeLspTools,
} from "../session/lsp-state.ts";
import { persistLspInactiveState } from "../session/tree-persist.ts";
import { updateLspUi } from "../ui/ui.ts";
import { refreshWorkspaceSentinels } from "../workspace-change.ts";

/**
 * Register handlers for before_agent_start (diagnostic injection) and context
 * (lsp-context message pruning / prompt-content restoration).
 */
export function registerDiagnosticInjectionHandlers(
  pi: ExtensionAPI,
  state: LspRuntimeState,
): void {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: before_agent_start coordinates sentinel recovery, pruning, refresh, and diagnostic injection.
  pi.on("before_agent_start", async (_event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    if (!state.manager || !state.lspActive) {
      removeLspTools(pi);
      if (!state.manager && state.lspActive) {
        persistLspInactiveState(pi, state);
      }
      return;
    }

    ensureLspToolsActive(pi);

    refreshWorkspaceSentinels(state, ctx.cwd);

    /**
     * Two-pass prune/refresh pattern:
     *
     * 1. Prune files deleted since the last turn and send didClose.
     * 2. Re-sync remaining open docs and wait for diagnostics to settle.
     * 3. Prune *again* — late publishDiagnostics notifications (already
     *    in-flight when step 1 ran) may have re-created stale entries for
     *    files that no longer exist. `getAllDiagnostics()` also filters
     *    by existence, so this second pass is belt-and-suspenders.
     */
    state.manager.pruneMissingFiles();
    try {
      await state.manager.refreshOpenDiagnostics();
    } catch {
      // Refresh failures must not prevent agent startup
    }
    state.manager.pruneMissingFiles();

    try {
      await forceResyncStaleModuleFiles(state.manager, ctx.cwd);
    } catch {
      // Best-effort: don't fail the agent turn
    }

    refreshProjectServers(state);
    updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);

    const diagnostics = state.manager.getOutstandingDiagnosticSummary(state.inlineSeverity);
    const totalDiags = diagnostics.reduce((sum, d) => sum + d.total, 0);
    const detailed =
      totalDiags <= MAX_DETAILED_DIAGNOSTICS
        ? state.manager.getOutstandingDiagnostics(state.inlineSeverity)
        : undefined;
    const staleAssessment = state.staleSuspected
      ? assessStaleDiagnostics(state.manager.getOutstandingDiagnostics(4))
      : { suspected: false, matchedFiles: [], warning: null };
    state.staleSuspected = staleAssessment.suspected;

    const staleWarning = staleAssessment.suspected ? staleAssessment.warning : null;
    const content = formatDiagnosticsContext(diagnostics, 3, detailed, staleWarning);
    const fingerprint = diagnosticsContextFingerprint(content);

    if (!content) {
      state.lastDiagnosticsFingerprint = null;
      state.currentContextToken = null;
      return;
    }

    if (fingerprint === state.lastDiagnosticsFingerprint) {
      state.currentContextToken = null;
      return;
    }

    state.lastDiagnosticsFingerprint = fingerprint;
    state.currentContextToken = `lsp-context-${++state.contextCounter}`;

    return buildDiagnosticResult(
      diagnostics,
      detailed,
      state.inlineSeverity,
      state.currentContextToken,
      staleWarning,
    );
  });

  pi.on("context", (event: ContextEvent) => {
    const messages = pruneAndReorderContextMessages(
      event.messages as Array<{
        role?: string;
        customType?: string;
        content?: unknown;
        details?: unknown;
      }>,
      "lsp-context",
      state.currentContextToken,
    );
    const contextMessages = restorePromptContent(
      messages,
      "lsp-context",
      state.currentContextToken,
    ) as typeof event.messages;

    if (
      contextMessages.length === event.messages.length &&
      contextMessages.every((message, index) => message === event.messages[index])
    ) {
      return;
    }
    return { messages: contextMessages };
  });
}

/** Build the `lsp-context` custom message used to surface outstanding diagnostics. */
// biome-ignore lint/complexity/useMaxParams: wrapper groups the prompt payload fields in one place.
function buildDiagnosticResult(
  diagnostics: OutstandingDiagnosticSummaryEntry[],
  detailed:
    | {
        file: string;
        diagnostics: Diagnostic[];
      }[]
    | undefined,
  severity: number,
  token: string,
  staleWarning?: string | null,
): BeforeAgentStartEventResult {
  return {
    message: {
      customType: "lsp-context",
      content: formatDiagnosticsDisplayContent(diagnostics, detailed),
      display: true,
      details: {
        contextToken: token,
        promptContent: formatDiagnosticsContext(diagnostics, 3, detailed, staleWarning),
        inlineSeverity: severity,
        ...(staleWarning ? { staleWarning } : {}),
        diagnostics: diagnostics.map((d) => ({
          file: d.file,
          errors: d.errors,
          warnings: d.warnings,
          information: d.information,
          hints: d.hints,
        })),
      },
    },
  };
}
