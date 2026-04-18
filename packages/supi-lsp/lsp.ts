// LSP Extension for pi — provides Language Server Protocol integration.
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
import { Type } from "@sinclair/typebox";
import { loadConfig } from "./config.ts";

const baseDir = dirname(fileURLToPath(import.meta.url));

import { pruneAndReorderContextMessages } from "@mrclrchtr/supi-core";
import {
  buildProjectGuidelines,
  diagnosticsContextFingerprint,
  formatDiagnosticsContext,
  lspPromptGuidelines,
  lspPromptSnippet,
} from "./guidance.ts";
import { LspManager } from "./manager.ts";
import type { OutstandingDiagnosticSummaryEntry } from "./manager-types.ts";
import { registerLspAwareToolOverrides } from "./overrides.ts";
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
  if (process.env.PI_LSP_DISABLED === "1") {
    registerDisabledStatusCommand(pi);
    return;
  }

  const state = createRuntimeState(parseSeverity(process.env.PI_LSP_SEVERITY));

  registerLspAwareToolOverrides(pi, {
    inlineSeverity: state.inlineSeverity,
    getManager: () => state.manager,
  });

  registerLspTool(pi, state, lspPromptGuidelines);
  registerSessionLifecycleHandlers(pi, state);
  registerBehaviorHandlers(pi, state);
  registerLspStatusCommand(pi, state);
  registerResourcesDiscover(pi);
}

function registerDisabledStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand("lsp-status", {
    description: "Show LSP server status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("LSP is disabled (PI_LSP_DISABLED=1)", "warning");
    },
  });
}

function createRuntimeState(inlineSeverity: number): LspRuntimeState {
  return {
    manager: null,
    inlineSeverity,
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

    ensureLspToolActive(pi);
    const config = loadConfig(process.cwd());
    state.manager = new LspManager(config);
    state.detectedServers = scanProjectCapabilities(config, process.cwd());
    state.manager.registerDetectedServers(state.detectedServers);
    await startDetectedServers(state.manager, state.detectedServers);
    refreshProjectServers(state);
    state.lastDiagnosticsFingerprint = null;
    state.currentContextToken = null;
    registerLspTool(pi, state, buildProjectGuidelines(state.projectServers));
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
    ensureLspToolActive(pi);
    if (!state.manager) return;

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
    ctx.ui.notify(buildDiagnosticsNotification(diagnostics), "info");

    return {
      message: {
        customType: "lsp-context",
        content,
        display: false,
        details: {
          contextToken: state.currentContextToken,
          inlineSeverity: state.inlineSeverity,
        },
      },
    };
  });

  pi.on("context", (event) => {
    const messages = pruneAndReorderContextMessages(
      event.messages as Array<{ role?: string; customType?: string; details?: unknown }>,
      "lsp-context",
      state.currentContextToken,
    ) as typeof event.messages;

    if (
      messages.length === event.messages.length &&
      messages.every((m, i) => m === event.messages[i])
    ) {
      return;
    }
    return { messages };
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

function buildDiagnosticsNotification(diagnostics: OutstandingDiagnosticSummaryEntry[]): string {
  if (diagnostics.length === 0) return "ℹ️ LSP diagnostics injected";
  if (diagnostics.length === 1) {
    const [entry] = diagnostics;
    if (!entry) return "ℹ️ LSP diagnostics injected";
    return `ℹ️ LSP: ${entry.file} — ${formatNotificationCounts(entry, ", ")}`;
  }

  const totals = collectDiagnosticTotals(diagnostics);
  return `ℹ️ LSP: ${diagnostics.length} files • ${formatNotificationCounts(totals, " • ")}`;
}

function formatNotificationCounts(
  entry: Pick<OutstandingDiagnosticSummaryEntry, "errors" | "warnings" | "information" | "hints">,
  separator: string,
): string {
  const parts: string[] = [];
  if (entry.errors > 0) parts.push(`${entry.errors} error${entry.errors === 1 ? "" : "s"}`);
  if (entry.warnings > 0) parts.push(`${entry.warnings} warning${entry.warnings === 1 ? "" : "s"}`);
  if (entry.information > 0)
    parts.push(`${entry.information} info${entry.information === 1 ? "" : "s"}`);
  if (entry.hints > 0) parts.push(`${entry.hints} hint${entry.hints === 1 ? "" : "s"}`);
  return parts.join(separator);
}

function collectDiagnosticTotals(
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): Pick<OutstandingDiagnosticSummaryEntry, "errors" | "warnings" | "information" | "hints"> {
  return diagnostics.reduce(
    (totals, entry) => ({
      errors: totals.errors + entry.errors,
      warnings: totals.warnings + entry.warnings,
      information: totals.information + entry.information,
      hints: totals.hints + entry.hints,
    }),
    { errors: 0, warnings: 0, information: 0, hints: 0 },
  );
}

function isLspAwareTool(toolName: string): boolean {
  return toolName === "lsp" || toolName === "read" || toolName === "write" || toolName === "edit";
}

function ensureLspToolActive(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  if (activeTools.includes("lsp")) return;
  pi.setActiveTools([...activeTools, "lsp"]);
}

function parseSeverity(env: string | undefined): number {
  if (!env) return 1;
  const parsed = Number.parseInt(env, 10);
  return parsed >= 1 && parsed <= 4 ? parsed : 1;
}

function registerResourcesDiscover(pi: ExtensionAPI): void {
  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "resources")],
  }));
}
