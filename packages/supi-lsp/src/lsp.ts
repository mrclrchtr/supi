// LSP Extension for pi — registers an expert semantic toolset, keeps language servers warm,
// surfaces inline diagnostics, and injects diagnostic context only when outstanding issues exist.
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: lsp.ts stays cohesive wiring; recovery and sentinel helpers live in focused modules.

import * as path from "node:path";
import type {
  AgentEndEvent,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { pruneAndReorderContextMessages, restorePromptContent } from "@mrclrchtr/supi-core/api";
import { loadConfig, resolveLanguageAlias } from "./config/config.ts";
import { clearTsconfigCache } from "./config/tsconfig-scope.ts";
import { FileChangeType } from "./config/types.ts";
import {
  diagnosticsContextFingerprint,
  formatDiagnosticsContext,
  MAX_DETAILED_DIAGNOSTICS,
} from "./diagnostics/diagnostic-context.ts";
import { formatDiagnosticsDisplayContent } from "./diagnostics/diagnostic-display.ts";
import { assessStaleDiagnostics } from "./diagnostics/stale-diagnostics.ts";
import {
  isWorkspaceRecoveryTrigger,
  scanWorkspaceSentinels,
  syncWorkspaceSentinelSnapshot,
} from "./diagnostics/workspace-sentinels.ts";
import { LspManager } from "./manager/manager.ts";
import { forceResyncStaleModuleFiles } from "./manager/manager-stale-resync.ts";
import {
  createRuntimeState,
  disableLspState,
  ensureLspToolsActive,
  isLspAwareTool,
  type LspRuntimeState,
  refreshProjectServers,
  removeLspTools,
} from "./session/lsp-state.ts";
import {
  scanMissingServers,
  scanProjectCapabilities,
  startDetectedServers,
} from "./session/scanner.ts";
import {
  clearSessionLspService,
  SessionLspService,
  setSessionLspServiceState,
} from "./session/service-registry.ts";
import {
  getLspDisabledMessage,
  loadLspSettings,
  registerLspSettings,
} from "./session/settings-registration.ts";
import {
  persistLspActiveState,
  persistLspInactiveState,
  registerTreePersistHandlers,
} from "./session/tree-persist.ts";
import { buildLspToolPromptSurfaces, defaultLspToolPromptSurfaces } from "./tool/guidance.ts";
import { registerLspAwareToolOverrides } from "./tool/overrides.ts";
import { registerLspTools } from "./tool/register-tools.ts";
import { registerLspMessageRenderer } from "./ui/renderer.ts";
import { toggleLspStatusOverlay, updateLspUi } from "./ui/ui.ts";
import { fileToUri, resolveSessionPath } from "./utils.ts";

export default function lspExtension(pi: ExtensionAPI) {
  registerLspSettings();
  const state = createRuntimeState();

  registerLspAwareToolOverrides(pi, {
    getInlineSeverity: () => state.inlineSeverity,
    getManager: () => state.manager,
    isActive: () => state.lspActive,
  });

  registerLspTools(pi, defaultLspToolPromptSurfaces);
  registerSessionLifecycleHandlers(pi, state);
  registerBehaviorHandlers(pi, state);
  registerTreePersistHandlers(pi, state);
  registerLspStatusCommand(pi, state);
  registerLspMessageRenderer(pi);
}

function registerSessionLifecycleHandlers(pi: ExtensionAPI, state: LspRuntimeState): void {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: session_start orchestrates setup, server detection, settings, and persistence.
  pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
    if (state.manager) {
      clearSessionLspService(state.manager.getCwd());
      await state.manager.shutdownAll();
    }

    const cwd = ctx.cwd;
    clearTsconfigCache();
    const lspSettings = loadLspSettings(cwd);

    if (!lspSettings.enabled) {
      clearSessionLspService(cwd);
      disableLspState(pi, state);
      persistLspInactiveState(pi, state);
      setSessionLspServiceState(cwd, { kind: "disabled" });
      return;
    }

    state.inlineSeverity = lspSettings.severity;

    const config = loadConfig(cwd);

    // Apply server allowlist filter from supi shared config
    if (lspSettings.active.length > 0) {
      const allowList = new Set(lspSettings.active.map(resolveLanguageAlias));
      for (const name of Object.keys(config.servers)) {
        if (!allowList.has(name)) {
          delete config.servers[name];
        }
      }
    }

    clearSessionLspService(cwd);
    state.manager = new LspManager(config, cwd);
    state.manager.setExcludePatterns(lspSettings.exclude ?? []);
    setSessionLspServiceState(cwd, { kind: "pending" });
    state.detectedServers = scanProjectCapabilities(config, cwd);
    state.manager.registerDetectedServers(state.detectedServers);
    await startDetectedServers(state.manager, state.detectedServers);

    const missing = scanMissingServers(config, cwd);
    if (missing.length > 0) {
      const parts = missing.map((m) => `${m.name} (${m.command})`);
      ctx.ui.notify(
        `LSP server not found for: ${parts.join(", ")}. Install the server to enable language intelligence.`,
        "warning",
      );
    }

    state.sentinelSnapshot = scanWorkspaceSentinels(cwd);
    state.lastWorkspaceChangeAt = 0;
    state.staleSuspected = false;
    refreshProjectServers(state);
    state.lastDiagnosticsFingerprint = null;
    state.currentContextToken = null;
    state.lspActive = true;
    setSessionLspServiceState(cwd, {
      kind: "ready",
      service: new SessionLspService(state.manager),
    });
    registerLspTools(pi, buildLspToolPromptSurfaces(state.projectServers, cwd));
    ensureLspToolsActive(pi);
    persistLspActiveState(pi, state);
    updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
  });

  pi.on("session_shutdown", async () => {
    clearTsconfigCache();
    if (state.manager) {
      clearSessionLspService(state.manager.getCwd());
      await state.manager.shutdownAll();
      state.manager = null;
    }

    state.inspector.close?.();
    state.detectedServers = [];
    state.projectServers = [];
    state.lastDiagnosticsFingerprint = null;
    state.currentContextToken = null;
    state.staleSuspected = false;
    state.lastWorkspaceChangeAt = 0;
    state.sentinelSnapshot = new Map();
  });

  pi.on("agent_end", async (_event: AgentEndEvent, ctx: ExtensionContext) => {
    state.currentContextToken = null;
    refreshProjectServers(state);

    if (state.manager) {
      updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
    }
  });
}

function markWorkspaceChange(state: LspRuntimeState): void {
  state.lastWorkspaceChangeAt = Date.now();
  state.staleSuspected = true;
  state.lastDiagnosticsFingerprint = null;
  state.currentContextToken = null;
}

function softRecoverWorkspaceChanges(
  state: LspRuntimeState,
  changes: import("./config/types.ts").FileEvent[],
): boolean {
  if (!state.manager || changes.length === 0) return false;

  clearTsconfigCache();
  state.manager.clearAllPullResultIds();
  state.manager.notifyWorkspaceFileChanges(changes);
  markWorkspaceChange(state);
  return true;
}

function refreshWorkspaceSentinels(state: LspRuntimeState, cwd: string): boolean {
  const { snapshot, changes } = syncWorkspaceSentinelSnapshot(cwd, state.sentinelSnapshot);
  state.sentinelSnapshot = snapshot;
  return softRecoverWorkspaceChanges(state, changes);
}

function shouldInvalidateTsconfigScopeCache(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".json" || ext === ".jsonc";
}

function recoverWorkspaceChangesFromToolResult(
  state: LspRuntimeState,
  cwd: string,
  event: { toolName: string; isError: boolean; input?: unknown },
): boolean {
  if (!state.manager || event.isError) return false;
  if (event.toolName !== "write" && event.toolName !== "edit") return false;
  if (!event.input || typeof event.input !== "object") return false;

  const pathValue = (event.input as { path?: unknown }).path;
  if (typeof pathValue !== "string") return false;

  const resolvedPath = resolveSessionPath(cwd, pathValue);
  if (shouldInvalidateTsconfigScopeCache(resolvedPath)) {
    clearTsconfigCache();
  }
  const fileEvent = { uri: fileToUri(resolvedPath), type: FileChangeType.Changed };

  // Sentinel files (package.json, tsconfig.json, lockfiles, .d.ts)
  if (isWorkspaceRecoveryTrigger(resolvedPath, cwd)) {
    if (resolvedPath.endsWith(".d.ts")) {
      return softRecoverWorkspaceChanges(state, [fileEvent]);
    }

    const { snapshot, changes } = syncWorkspaceSentinelSnapshot(cwd, state.sentinelSnapshot);
    state.sentinelSnapshot = snapshot;
    return softRecoverWorkspaceChanges(state, changes.length > 0 ? changes : [fileEvent]);
  }

  // Source files matching an active language server's file types
  if (state.manager.hasServerForExtension(resolvedPath)) {
    return softRecoverWorkspaceChanges(state, [fileEvent]);
  }

  return false;
}

/** Build the `lsp-context` custom message used to surface outstanding diagnostics. */
// biome-ignore lint/complexity/useMaxParams: wrapper groups the prompt payload fields in one place.
function buildDiagnosticResult(
  diagnostics: import("./manager/manager-types.ts").OutstandingDiagnosticSummaryEntry[],
  detailed: { file: string; diagnostics: import("./config/types.ts").Diagnostic[] }[] | undefined,
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

function registerBehaviorHandlers(pi: ExtensionAPI, state: LspRuntimeState): void {
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

    // Force re-open files with module-resolution errors to clear stale
    // diagnostics that persist when the TS server caches by content hash.
    // Must run before the diagnostic summary so fresh results are captured.
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

  pi.on("tool_result", async (event: ToolResultEvent, ctx: ExtensionContext) => {
    if (!state.manager) return;

    const recoveryTriggered = recoverWorkspaceChangesFromToolResult(state, ctx.cwd, {
      toolName: event.toolName,
      isError: event.isError,
      input: (event as { input?: unknown }).input,
    });

    if (recoveryTriggered || isLspAwareTool(event.toolName)) {
      refreshProjectServers(state);
      updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
    }
  });
}

function registerLspStatusCommand(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.registerCommand("lsp-status", {
    description: "Show detected LSP servers, roots, open files, and diagnostics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const lspSettings = loadLspSettings(ctx.cwd);
      if (!lspSettings.enabled) {
        ctx.ui.notify(getLspDisabledMessage(ctx.cwd), "warning");
        return;
      }

      if (!state.manager) {
        ctx.ui.notify("LSP not initialized", "warning");
        return;
      }

      refreshProjectServers(state);
      toggleLspStatusOverlay(
        ctx,
        state.manager,
        state.inlineSeverity,
        state.inspector,
        state.projectServers,
      );
    },
  });
}
