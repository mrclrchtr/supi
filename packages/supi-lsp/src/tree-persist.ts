// LSP tree navigation persistence — restores tool activation state across /tree navigation.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** Shape of the entry persisted via `pi.appendEntry()`. */
export interface LspStateEntry {
  active: boolean;
}

/** Restore LSP activation state from the current branch after /tree navigation. */
export function registerTreePersistHandlers(pi: ExtensionAPI, state: { lspActive: boolean }): void {
  pi.on("session_tree", async (_event, ctx) => {
    const branch = ctx.sessionManager.getBranch();
    let lastEntry: LspStateEntry | undefined;

    for (const entry of branch) {
      if (entry.type === "custom" && entry.customType === "lsp-active") {
        lastEntry = entry.data as LspStateEntry | undefined;
      }
    }

    if (lastEntry?.active) {
      const activeTools = pi.getActiveTools();
      if (!activeTools.includes("lsp")) {
        pi.setActiveTools([...activeTools, "lsp"]);
      }
      state.lspActive = true;
    } else {
      const activeTools = pi.getActiveTools();
      if (activeTools.includes("lsp")) {
        pi.setActiveTools(activeTools.filter((t) => t !== "lsp"));
      }
      state.lspActive = false;
    }
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
