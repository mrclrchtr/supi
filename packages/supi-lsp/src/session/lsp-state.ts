// LSP extension runtime state and tool management helpers.
// Extracted from lsp.ts to keep file sizes within Biome limits.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { DetectedProjectServer, ProjectServerInfo } from "../config/server-config.ts";
import type { LspManager } from "../manager/manager.ts";
import { LSP_TOOL_NAMES } from "../tool/names.ts";
import type { LspInspectorState } from "../ui/ui.ts";
import { introspectCapabilities } from "./scanner.ts";
import { clearSessionLspService } from "./service-registry.ts";

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
  sentinelSnapshot: Map<string, number>;
  staleSuspected: boolean;
  lastWorkspaceChangeAt: number;
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
    sentinelSnapshot: new Map(),
    staleSuspected: false,
    lastWorkspaceChangeAt: 0,
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
  return (
    LSP_TOOL_NAMES.includes(toolName as (typeof LSP_TOOL_NAMES)[number]) ||
    toolName === "read" ||
    toolName === "write" ||
    toolName === "edit"
  );
}

export function disableLspState(pi: ExtensionAPI, state: LspRuntimeState): void {
  if (state.manager) {
    clearSessionLspService(state.manager.getCwd());
  }
  state.inspector.close?.();
  state.manager = null;
  state.detectedServers = [];
  state.projectServers = [];
  state.lastDiagnosticsFingerprint = null;
  state.currentContextToken = null;
  state.staleSuspected = false;
  state.lastWorkspaceChangeAt = 0;
  state.sentinelSnapshot = new Map();
  state.lspActive = false;
  removeLspTools(pi);
}

export function removeLspTools(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  const nextTools = activeTools.filter(
    (toolName: string) => !LSP_TOOL_NAMES.includes(toolName as (typeof LSP_TOOL_NAMES)[number]),
  );
  if (nextTools.length !== activeTools.length) {
    pi.setActiveTools(nextTools);
  }
}

export function ensureLspToolsActive(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  const missing = LSP_TOOL_NAMES.filter((toolName) => !activeTools.includes(toolName));
  if (missing.length === 0) return;
  pi.setActiveTools([...activeTools, ...missing]);
}
