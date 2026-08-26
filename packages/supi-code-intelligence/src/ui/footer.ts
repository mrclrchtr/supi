/**
 * LSP footer stats-end contribution for code-intelligence.
 *
 * Provides the persistent "| λ lsp • N ✓ • M open files" suffix on the
 * footer stats line, after cost and context info. This was removed during the
 * supi-lsp → supi-code-intelligence migration.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import { countProjectServerRouteStatuses } from "../analysis/health/server-status.ts";
import { LSP_STATE_CHANGE_EVENT, type LspAdapterState } from "../substrate/lsp/state.ts";

/** Build the LSP status text: "λ lsp • 3 ✓ • 1 ⟳ • 1 ✗ • 2 open files" */
export function buildLspStatusText(lspState: LspAdapterState): string | undefined {
  const controller = lspState.controller;
  const runtime = controller?.workspaceRuntime;
  if (!runtime) return undefined;

  const servers = runtime.getProjectServers();
  const openFiles = servers.reduce((sum, s) => sum + s.openFiles.length, 0);

  // Aggregate server states
  const ready = servers.filter((s) => s.status === "running" && s.ready).length;
  const starting = servers.filter((s) => s.status === "running" && !s.ready).length;
  const routeCounts = countProjectServerRouteStatuses(servers);

  const hasServers =
    ready + starting + routeCounts.recovering + routeCounts.error + routeCounts.unavailable > 0;
  if (!hasServers && openFiles === 0) return undefined;

  const parts = ["λ lsp"];
  if (ready > 0) parts.push(`${ready} ✓`);
  if (starting > 0) parts.push(`${starting} ⟳`);
  if (routeCounts.recovering > 0) parts.push(`${routeCounts.recovering} ↻`);
  if (routeCounts.error > 0) parts.push(`${routeCounts.error} ✗`);
  if (routeCounts.unavailable > 0) parts.push(`${routeCounts.unavailable} ⊘`);
  if (openFiles > 0) parts.push(`${openFiles} ${openFiles === 1 ? "open file" : "open files"}`);
  return parts.join(" • ");
}

// ── Footer stats contribution ───────────────────────────────────────────

const FOOTER_KEY = "lsp-status";

/** Register the LSP stats-end footer contribution for the given adapter state. */
export function registerLspFooterContribution(
  pi: ExtensionAPI,
  lspState: LspAdapterState,
): {
  dispose: () => void;
} {
  footerContributions.register({
    key: FOOTER_KEY,
    placement: "stats-end",
    priority: 100,
    render: () => {
      const text = buildLspStatusText(lspState);
      if (!text) return "";
      return `| ${text}`;
    },
  });

  // Trigger TUI re-render when server states change.
  const handler = () => pi.events.emit("supi:lsp:invalidate", {});
  lspState.stateChanges.addEventListener(LSP_STATE_CHANGE_EVENT, handler);

  return {
    dispose() {
      lspState.stateChanges.removeEventListener(LSP_STATE_CHANGE_EVENT, handler);
      unregisterLspFooterContribution();
    },
  };
}

/** Remove the LSP stats footer contribution. */
export function unregisterLspFooterContribution(): void {
  footerContributions.unregister(FOOTER_KEY);
}
