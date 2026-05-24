// LSP tree navigation persistence — restores tool activation state across /tree navigation.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LspManager } from "../manager/manager.ts";
import { LSP_TOOL_NAMES } from "../tool/names.ts";
import { SessionLspService, setSessionLspServiceState } from "./service-registry.ts";

/** Shape of the entry persisted via `pi.appendEntry()`. */
export interface LspStateEntry {
  active: boolean;
}

/** Restore LSP activation state from the current branch after /tree navigation. */
export function registerTreePersistHandlers(
  pi: ExtensionAPI,
  state: { lspActive: boolean; manager?: LspManager | null },
): void {
  pi.on("session_tree", async (_event, ctx) => {
    const branch = ctx.sessionManager.getBranch();
    const isActive = findLastLspState(branch)?.active === true;

    syncBranchToolActivation(pi, isActive);
    syncBranchServiceState(state.manager, isActive);
    state.lspActive = isActive;
  });
}

function findLastLspState(branch: Array<{ type: string; customType?: string; data?: unknown }>) {
  let lastEntry: LspStateEntry | undefined;
  for (const entry of branch) {
    if (entry.type === "custom" && entry.customType === "lsp-active") {
      lastEntry = entry.data as LspStateEntry | undefined;
    }
  }
  return lastEntry;
}

function syncBranchToolActivation(pi: ExtensionAPI, isActive: boolean): void {
  const activeTools = pi.getActiveTools();
  if (isActive) {
    const missing = LSP_TOOL_NAMES.filter((toolName) => !activeTools.includes(toolName));
    if (missing.length > 0) {
      pi.setActiveTools([...activeTools, ...missing]);
    }
    return;
  }

  const nextTools = activeTools.filter(
    (toolName) => !LSP_TOOL_NAMES.includes(toolName as (typeof LSP_TOOL_NAMES)[number]),
  );
  if (nextTools.length !== activeTools.length) {
    pi.setActiveTools(nextTools);
  }
}

function syncBranchServiceState(manager: LspManager | null | undefined, isActive: boolean): void {
  if (!manager) return;

  setSessionLspServiceState(manager.getCwd(), {
    kind: isActive ? "ready" : "inactive",
    service: new SessionLspService(manager),
  });
}

/** Persist that LSP is active in the session tree. */
export function persistLspActiveState(pi: ExtensionAPI, state: { lspActive: boolean }): void {
  state.lspActive = true;
  pi.appendEntry<LspStateEntry>("lsp-active", { active: true });
}

/** Persist that LSP is inactive in the session tree. */
export function persistLspInactiveState(pi: ExtensionAPI, state: { lspActive: boolean }): void {
  state.lspActive = false;
  pi.appendEntry<LspStateEntry>("lsp-active", { active: false });
}
