// Unified code-intelligence status command — replaces the old /lsp-status.

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSessionLspService, type ProjectServerInfo } from "@mrclrchtr/supi-lsp/api";
import { getSessionTreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";

export const CODE_INTELLIGENCE_STATUS_COMMAND = "code-intelligence-status";

/** Build LSP status lines for the current session cwd. */
function buildLspStatusLines(cwd: string): string[] {
  const lines: string[] = [];
  lines.push("### LSP");
  const lspState = getSessionLspService(cwd);
  switch (lspState.kind) {
    case "ready": {
      const servers = lspState.service.getProjectServers();
      if (servers.length === 0) {
        lines.push("- Status: ready, no servers detected");
      } else {
        lines.push("- Status: ready");
        for (const server of servers) {
          lines.push(formatServerLine(server));
        }
      }
      break;
    }
    case "pending":
      lines.push("- Status: starting...");
      break;
    case "disabled":
      lines.push("- Status: disabled");
      break;
    case "inactive":
      lines.push("- Status: inactive on this branch");
      break;
    case "unavailable":
      lines.push(`- Status: unavailable (${lspState.reason})`);
      break;
  }
  return lines;
}

function formatServerLine(server: ProjectServerInfo): string {
  const statusIcon = server.status === "running" ? "✓" : "✗";
  const actions =
    server.supportedActions.length > 0 ? ` [${server.supportedActions.join(", ")}]` : "";
  return `  - ${statusIcon} ${server.name} @ ${server.root}${actions}`;
}

/** Build Tree-sitter status lines for the current session cwd. */
function buildTsStatusLines(cwd: string): string[] {
  const lines: string[] = [];
  lines.push("### Tree-sitter");
  const tsState = getSessionTreeSitterService(cwd);
  switch (tsState.kind) {
    case "ready":
      lines.push("- Status: ready");
      break;
    case "unavailable":
      lines.push(`- Status: unavailable (${tsState.reason})`);
      break;
  }
  return lines;
}

/**
 * Register the unified `/code-intelligence-status` command.
 *
 * Replaces the old `/lsp-status` with a single command that shows
 * the status of all code-understanding substrates (LSP, Tree-sitter).
 */
export function registerCodeIntelligenceStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand(CODE_INTELLIGENCE_STATUS_COMMAND, {
    description: "Show code-intelligence status: LSP and Tree-sitter substrate state",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const lines: string[] = [];
      lines.push("## Code Intelligence Status");
      lines.push("");
      lines.push(...buildLspStatusLines(ctx.cwd));
      lines.push("");
      lines.push(...buildTsStatusLines(ctx.cwd));
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
