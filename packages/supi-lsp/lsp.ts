// LSP Extension for pi - provides Language Server Protocol integration.
//
// Gives the agent type-aware hover, go-to-definition,
// diagnostics, document-symbols, rename, and code-actions via a registered
// `lsp` tool. It keeps supported source files warm in their language servers,
// surfaces inline diagnostics after edits/writes, eagerly starts detected
// servers on session start, and injects compact diagnostic context only when
// outstanding diagnostics exist.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "./config.ts";
import { loadLspSettings, registerLspSettings } from "./settings-registration.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));

import { pruneAndReorderContextMessages, restorePromptContent } from "@mrclrchtr/supi-core";
import {
  buildProjectGuidelines,
  diagnosticsContextFingerprint,
  formatDiagnosticsContext,
  lspPromptGuidelines,
  lspPromptSnippet,
} from "./guidance.ts";
import { LspManager } from "./manager.ts";
import { registerLspAwareToolOverrides } from "./overrides.ts";
import { registerLspMessageRenderer } from "./renderer.ts";
import {
  introspectCapabilities,
  scanProjectCapabilities,
  startDetectedServers,
} from "./scanner.ts";
import { executeAction, type LspAction, lspToolDescription } from "./tool-actions.ts";
import type { DetectedProjectServer, ProjectServerInfo } from "./types.ts";
import { type LspInspectorState, toggleLspStatusOverlay, updateLspUi } from "./ui.ts";

const LspActionEnum = Type.Union([
  Type.Literal("hover"),
  Type.Literal("definition"),
  Type.Literal("references"),
  Type.Literal("diagnostics"),
  Type.Literal("symbols"),
  Type.Literal("rename"),
  Type.Literal("code_actions"),
  Type.Literal("workspace_symbol"),
  Type.Literal("search"),
  Type.Literal("symbol_hover"),
]);

interface LspRuntimeState {
  manager: LspManager | null;
  inlineSeverity: number;
  inspector: LspInspectorState;
  detectedServers: DetectedProjectServer[];
  projectServers: ProjectServerInfo[];
  lastDiagnosticsFingerprint: string | null;
  currentContextToken: string | null;
  contextCounter: number;
}

export default function lspExtension(pi: ExtensionAPI) {
  registerLspSettings(process.cwd());
  const state = createRuntimeState();

  registerLspAwareToolOverrides(pi, {
    getInlineSeverity: () => state.inlineSeverity,
    getManager: () => state.manager,
    cwd: process.cwd(),
  });

  registerLspTool(pi, state, lspPromptGuidelines);
  registerSessionLifecycleHandlers(pi, state);
  registerBehaviorHandlers(pi, state);
  registerLspStatusCommand(pi, state);
  registerResourcesDiscover(pi);
  registerLspMessageRenderer(pi);
}

function createRuntimeState(): LspRuntimeState {
  return {
    manager: null,
    inlineSeverity: 1,
    inspector: {
      handle: null,
      close: null,
    },
    detectedServers: [],
    projectServers: [],
    lastDiagnosticsFingerprint: null,
    currentContextToken: null,
    contextCounter: 0,
  };
}

function registerSessionLifecycleHandlers(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.on("session_start", async (_event, ctx) => {
    if (state.manager) {
      await state.manager.shutdownAll();
    }

    const cwd = ctx.cwd;
    const lspSettings = loadLspSettings(cwd);

    if (!lspSettings.enabled) {
      disableLspState(pi, state);
      return;
    }

    state.inlineSeverity = lspSettings.severity;

    ensureLspToolActive(pi);
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

    state.manager = new LspManager(config, cwd);
    state.detectedServers = scanProjectCapabilities(config, cwd);
    state.manager.registerDetectedServers(state.detectedServers);
    await startDetectedServers(state.manager, state.detectedServers);
    refreshProjectServers(state);
    state.lastDiagnosticsFingerprint = null;
    state.currentContextToken = null;
    registerLspTool(pi, state, buildProjectGuidelines(state.projectServers, cwd));
    ensureLspToolActive(pi);
    updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);
  });

  pi.on("session_shutdown", async () => {
    if (state.manager) {
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

function registerBehaviorHandlers(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.on("before_agent_start", async (_event, ctx) => {
    if (!state.manager) {
      const activeTools = pi.getActiveTools();
      if (activeTools.includes("lsp")) {
        pi.setActiveTools(activeTools.filter((t) => t !== "lsp"));
      }
      return;
    }

    ensureLspToolActive(pi);

    state.manager.pruneMissingFiles();
    refreshProjectServers(state);
    updateLspUi(ctx, state.manager, state.inlineSeverity, state.projectServers);

    const diagnostics = state.manager.getOutstandingDiagnosticSummary(state.inlineSeverity);
    const content = formatDiagnosticsContext(diagnostics);
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

    return {
      message: {
        customType: "lsp-context",
        content: formatDiagnosticsDisplayContent(diagnostics),
        display: true,
        details: {
          contextToken: state.currentContextToken,
          promptContent: content,
          inlineSeverity: state.inlineSeverity,
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
        ctx.ui.notify("LSP is disabled in settings", "warning");
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

function refreshProjectServers(state: LspRuntimeState): void {
  if (!state.manager) {
    state.projectServers = [];
    return;
  }

  state.projectServers = introspectCapabilities(state.manager, state.detectedServers);
}

function isLspAwareTool(toolName: string): boolean {
  return toolName === "lsp" || toolName === "read" || toolName === "write" || toolName === "edit";
}

function formatDiagnosticsDisplayContent(
  diagnostics: Array<{
    errors: number;
    warnings: number;
    information: number;
    hints: number;
  }>,
): string {
  const totals = diagnostics.reduce(
    (acc, d) => ({
      errors: acc.errors + d.errors,
      warnings: acc.warnings + d.warnings,
      information: acc.information + d.information,
      hints: acc.hints + d.hints,
    }),
    { errors: 0, warnings: 0, information: 0, hints: 0 },
  );
  const parts: string[] = [];
  if (totals.errors > 0) parts.push(`${totals.errors} error${totals.errors === 1 ? "" : "s"}`);
  if (totals.warnings > 0)
    parts.push(`${totals.warnings} warning${totals.warnings === 1 ? "" : "s"}`);
  if (totals.information > 0)
    parts.push(`${totals.information} info${totals.information === 1 ? "" : "s"}`);
  if (totals.hints > 0) parts.push(`${totals.hints} hint${totals.hints === 1 ? "" : "s"}`);

  return parts.length > 0
    ? `LSP diagnostics injected (${parts.join(", ")})`
    : "LSP diagnostics injected";
}

function disableLspState(pi: ExtensionAPI, state: LspRuntimeState): void {
  state.manager = null;
  state.detectedServers = [];
  state.projectServers = [];
  state.lastDiagnosticsFingerprint = null;
  state.currentContextToken = null;

  const activeTools = pi.getActiveTools();
  if (activeTools.includes("lsp")) {
    pi.setActiveTools(activeTools.filter((t) => t !== "lsp"));
  }
}

function ensureLspToolActive(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  if (activeTools.includes("lsp")) return;
  pi.setActiveTools([...activeTools, "lsp"]);
}

function registerResourcesDiscover(pi: ExtensionAPI): void {
  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "resources")],
  }));
}
