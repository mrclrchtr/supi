/**
 * LSP footer stats-end contribution for code-intelligence.
 *
 * Provides the persistent "| λ lsp • N servers • M open files" suffix on the
 * footer stats line, after cost and context info. This was removed during the
 * supi-lsp → supi-code-intelligence migration.
 */

import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import type { LspAdapterState } from "./runtime-state.ts";

/** Build the LSP status text: "λ lsp • 2 servers • 5 open files" */
export function buildLspStatusText(lspState: LspAdapterState): string | undefined {
  const controller = lspState.controller;
  const service = controller?.service;
  if (!service) return undefined;

  const servers = service.getProjectServers();
  const runningServers = servers.filter((s) => s.status === "running").length;
  const openFiles = servers.reduce((sum, s) => sum + s.openFiles.length, 0);

  if (runningServers === 0 && openFiles === 0) return undefined;

  const parts = ["λ lsp"];
  if (runningServers > 0)
    parts.push(`${runningServers} ${runningServers === 1 ? "server" : "servers"}`);
  if (openFiles > 0) parts.push(`${openFiles} ${openFiles === 1 ? "open file" : "open files"}`);
  return parts.join(" • ");
}

// ── Footer stats contribution ───────────────────────────────────────────

const FOOTER_KEY = "lsp-status";

/** Register the LSP stats-end footer contribution for the given adapter state. */
export function registerLspFooterContribution(lspState: LspAdapterState): void {
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
}

/** Remove the LSP stats footer contribution. */
export function unregisterLspFooterContribution(): void {
  footerContributions.unregister(FOOTER_KEY);
}
