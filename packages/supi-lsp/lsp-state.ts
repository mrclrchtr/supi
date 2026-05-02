// LSP extension runtime state and tool management helpers.
// Extracted from lsp.ts to keep file sizes within Biome limits.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { LspManager } from "./manager.ts";
import { introspectCapabilities } from "./scanner.ts";
import { clearSessionLspService } from "./service-registry.ts";
import type { DetectedProjectServer, ProjectServerInfo } from "./types.ts";
import type { LspInspectorState } from "./ui.ts";

export interface LspRuntimeState {
  manager: LspManager | null;
  inlineSeverity: number;
  inspector: LspInspectorState;
  detectedServers: DetectedProjectServer[];
  projectServers: ProjectServerInfo[];
  lastDiagnosticsFingerprint: string | null;
  currentContextToken: string | null;
  contextCounter: number;
  lspActive: boolean;
}

export function createRuntimeState(): LspRuntimeState {
  return {
    manager: null,
    inlineSeverity: 1,
    inspector: { handle: null, close: null },
    detectedServers: [],
    projectServers: [],
    lastDiagnosticsFingerprint: null,
    currentContextToken: null,
    contextCounter: 0,
    lspActive: false,
  };
}

export function refreshProjectServers(state: LspRuntimeState): void {
  if (!state.manager) {
    state.projectServers = [];
    return;
  }
  state.projectServers = introspectCapabilities(state.manager, state.detectedServers);
}

export function isLspAwareTool(toolName: string): boolean {
  return toolName === "lsp" || toolName === "read" || toolName === "write" || toolName === "edit";
}

export function disableLspState(pi: ExtensionAPI, state: LspRuntimeState): void {
  if (state.manager) {
    clearSessionLspService(state.manager.getCwd());
  }
  state.manager = null;
  state.detectedServers = [];
  state.projectServers = [];
  state.lastDiagnosticsFingerprint = null;
  state.currentContextToken = null;
  state.lspActive = false;
  removeLspTool(pi);
}

export function removeLspTool(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  if (activeTools.includes("lsp")) pi.setActiveTools(activeTools.filter((t) => t !== "lsp"));
}

export function ensureLspToolActive(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  if (activeTools.includes("lsp")) return;
  pi.setActiveTools([...activeTools, "lsp"]);
}
