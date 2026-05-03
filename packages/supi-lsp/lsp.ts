// LSP Extension for pi — provides hover, definition, diagnostics, symbols, rename, code-actions
// via a registered `lsp` tool. Keeps language servers warm, surfaces inline diagnostics,
// and injects diagnostic context only when outstanding issues exist.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@mariozechner/pi-ai";
import type { BeforeAgentStartEventResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { pruneAndReorderContextMessages, restorePromptContent } from "@mrclrchtr/supi-core";
import { Type } from "typebox";
import { loadConfig } from "./config.ts";
import { formatDiagnosticsDisplayContent } from "./diagnostic-display.ts";
import {
  buildProjectGuidelines,
  diagnosticsContextFingerprint,
  formatDiagnosticsContext,
  lspPromptGuidelines,
  lspPromptSnippet,
  MAX_DETAILED_DIAGNOSTICS,
} from "./guidance.ts";
import {
  createRuntimeState,
  disableLspState,
  ensureLspToolActive,
  isLspAwareTool,
  type LspRuntimeState,
  refreshProjectServers,
  removeLspTool,
} from "./lsp-state.ts";
import { LspManager } from "./manager.ts";
import { registerLspAwareToolOverrides } from "./overrides.ts";
import { registerLspMessageRenderer } from "./renderer.ts";
import { scanProjectCapabilities, startDetectedServers } from "./scanner.ts";
import {
  clearSessionLspService,
  SessionLspService,
  setSessionLspServiceState,
} from "./service-registry.ts";
import {
  getLspDisabledMessage,
  loadLspSettings,
  registerLspSettings,
} from "./settings-registration.ts";
import { executeAction, type LspAction, lspToolDescription } from "./tool-actions.ts";
import {
  persistLspActiveState,
  persistLspInactiveState,
  registerTreePersistHandlers,
} from "./tree-persist.ts";
import { toggleLspStatusOverlay, updateLspUi } from "./ui.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));

const LspActionEnum = StringEnum([
  "hover",
  "definition",
  "references",
  "diagnostics",
  "symbols",
  "rename",
  "code_actions",
  "workspace_symbol",
  "search",
  "symbol_hover",
] as const);

export default function lspExtension(pi: ExtensionAPI) {
  registerLspSettings();
  const state = createRuntimeState();

  registerLspAwareToolOverrides(pi, {
    getInlineSeverity: () => state.inlineSeverity,
    getManager: () => state.manager,
    getCwd: () => state.manager?.getCwd() ?? process.cwd(),
  });

  registerLspTool(pi, state, lspPromptGuidelines);
  registerSessionLifecycleHandlers(pi, state);
  registerBehaviorHandlers(pi, state);
  registerTreePersistHandlers(pi, state);
  registerLspStatusCommand(pi, state);
  registerResourcesDiscover(pi);
  registerLspMessageRenderer(pi);
}

function registerSessionLifecycleHandlers(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.on("session_start", async (_event, ctx) => {
    if (state.manager) {
      clearSessionLspService(state.manager.getCwd());
      await state.manager.shutdownAll();
    }

    const cwd = ctx.cwd;
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
    if (lspSettings.servers.length > 0) {
      const allowList = new Set(lspSettings.servers);
      for (const name of Object.keys(config.servers)) {
        if (!allowList.has(name)) {
          delete config.servers[name];
        }
      }
    }

    clearSessionLspService(cwd);
    state.manager = new LspManager(config, cwd);
    setSessionLspServiceState(cwd, { kind: "pending" });
    state.detectedServers = scanProjectCapabilities(config, cwd);
    state.manager.registerDetectedServers(state.detectedServers);
    await startDetectedServers(state.manager, state.detectedServers);
    refreshProjectServers(state);
    state.lastDiagnosticsFingerprint = null;
    state.currentContextToken = null;
    state.lspActive = true;
    setSessionLspServiceState(cwd, {
      kind: "ready",
      service: new SessionLspService(state.manager),
    });
    registerLspTool(pi, state, buildProjectGuidelines(state.projectServers, cwd));
    ensureLspToolActive(pi);
    persistLspActiveState(pi, state);
    updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
  });

  pi.on("session_shutdown", async () => {
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
  });

  pi.on("agent_end", async (_event, ctx) => {
    state.currentContextToken = null;
    refreshProjectServers(state);

    if (state.manager) {
      updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
    }
  });
}

/** Build the `lsp-context` custom message used to surface outstanding diagnostics. */
function buildDiagnosticResult(
  diagnostics: import("./manager-types.ts").OutstandingDiagnosticSummaryEntry[],
  detailed: { file: string; diagnostics: import("./types.ts").Diagnostic[] }[] | undefined,
  severity: number,
  token: string,
): BeforeAgentStartEventResult {
  return {
    message: {
      customType: "lsp-context",
      content: formatDiagnosticsDisplayContent(diagnostics, detailed),
      display: true,
      details: {
        contextToken: token,
        promptContent: formatDiagnosticsContext(diagnostics, 3, detailed),
        inlineSeverity: severity,
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
  pi.on("before_agent_start", async (_event, ctx) => {
    if (!state.manager || !state.lspActive) {
      removeLspTool(pi);
      if (!state.manager && state.lspActive) {
        persistLspInactiveState(pi, state);
      }
      return;
    }

    ensureLspToolActive(pi);

    state.manager.pruneMissingFiles();
    try {
      await state.manager.refreshOpenDiagnostics();
    } catch {
      // Refresh failures must not prevent agent startup
    }
    refreshProjectServers(state);
    updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);

    const diagnostics = state.manager.getOutstandingDiagnosticSummary(state.inlineSeverity);
    const totalDiags = diagnostics.reduce((sum, d) => sum + d.total, 0);
    const detailed =
      totalDiags <= MAX_DETAILED_DIAGNOSTICS
        ? state.manager.getOutstandingDiagnostics(state.inlineSeverity)
        : undefined;
    const content = formatDiagnosticsContext(diagnostics, 3, detailed);
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

    const result = buildDiagnosticResult(
      diagnostics,
      detailed,
      state.inlineSeverity,
      state.currentContextToken,
    );

    return result;
  });

  pi.on("context", (event) => {
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
      contextMessages.every((m, i) => m === event.messages[i])
    ) {
      return;
    }
    return { messages: contextMessages };
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!state.manager) return;

    if (isLspAwareTool(event.toolName)) {
      refreshProjectServers(state);
      updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
    }
  });
}

function registerLspTool(
  pi: ExtensionAPI,
  state: LspRuntimeState,
  promptGuidelines: string[],
): void {
  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description: lspToolDescription,
    promptSnippet: lspPromptSnippet,
    promptGuidelines,
    parameters: Type.Object({
      action: LspActionEnum,
      file: Type.Optional(Type.String({ description: "File path (relative or absolute)" })),
      line: Type.Optional(Type.Number({ description: "1-based line number" })),
      character: Type.Optional(Type.Number({ description: "1-based column number" })),
      newName: Type.Optional(Type.String({ description: "New name (for rename action)" })),
      query: Type.Optional(
        Type.String({ description: "Search query (for workspace_symbol and search actions)" }),
      ),
      symbol: Type.Optional(Type.String({ description: "Symbol name (for symbol_hover action)" })),
    }),
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!state.manager) {
        return {
          content: [{ type: "text", text: "LSP not initialized. Start a new session first." }],
          details: {},
        };
      }

      const text = await executeAction(
        state.manager,
        params as {
          action: LspAction;
          file?: string;
          line?: number;
          character?: number;
          newName?: string;
          query?: string;
          symbol?: string;
        },
      );

      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  });
}

function registerLspStatusCommand(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.registerCommand("lsp-status", {
    description: "Show detected LSP servers, roots, open files, and diagnostics",
    handler: async (_args, ctx) => {
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

function registerResourcesDiscover(pi: ExtensionAPI): void {
  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "resources")],
  }));
}
