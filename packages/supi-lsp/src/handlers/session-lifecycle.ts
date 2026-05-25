// Session lifecycle handlers — session_start, session_shutdown, and agent_end.
//
// Extracted from lsp.ts to keep each orchestration concern in its own module.

import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import type { WorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { loadConfig, resolveLanguageAlias } from "../config/config.ts";
import { clearTsconfigCache } from "../config/tsconfig-scope.ts";
import { scanWorkspaceSentinels } from "../diagnostics/workspace-sentinels.ts";
import { LspManager } from "../manager/manager.ts";
import {
  disableLspState,
  ensureLspToolsActive,
  type LspRuntimeState,
  refreshProjectServers,
} from "../session/lsp-state.ts";
import {
  registerLspCapabilities,
  unregisterLspCapabilities,
} from "../session/runtime-registration.ts";
import {
  scanMissingServers,
  scanProjectCapabilities,
  startDetectedServers,
} from "../session/scanner.ts";
import {
  clearSessionLspService,
  SessionLspService,
  setSessionLspServiceState,
} from "../session/service-registry.ts";
import { loadLspSettings } from "../session/settings-registration.ts";
import { persistLspActiveState, persistLspInactiveState } from "../session/tree-persist.ts";
import { buildLspToolPromptSurfaces } from "../tool/guidance.ts";
import { registerLspTools } from "../tool/register-tools.ts";
import { updateLspUi } from "../ui/ui.ts";

/**
 * Register session lifecycle handlers (start, shutdown, and agent-end cleanup).
 *
 * - `session_start`: initialises the LspManager, starts detected servers, wires
 *   dynamic tool guidance, publishes runtime capabilities, and syncs UI state.
 * - `session_shutdown`: tears down the manager and clears runtime state.
 * - `agent_end`: refreshes project-server info and updates the LSP status UI.
 */
export function registerSessionLifecycleHandlers(
  pi: ExtensionAPI,
  state: LspRuntimeState,
  runtime: WorkspaceRuntime,
): void {
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
    const service = new SessionLspService(state.manager);
    setSessionLspServiceState(cwd, { kind: "ready", service });
    registerLspCapabilities(runtime, cwd, service);
    registerLspTools(pi, buildLspToolPromptSurfaces(state.projectServers, cwd));
    ensureLspToolsActive(pi);
    persistLspActiveState(pi, state);
    updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
  });

  pi.on("session_shutdown", async () => {
    clearTsconfigCache();
    if (state.manager) {
      const cwd = state.manager.getCwd();
      unregisterLspCapabilities(runtime, cwd);
      clearSessionLspService(cwd);
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
