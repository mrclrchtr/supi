// Unified code-intelligence status view helper.

import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import { getSessionTreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";

export interface CodeIntelligenceStatus {
  lsp: {
    kind: string;
    serverCount: number;
    runningServerCount: number;
    summary: string;
  };
  treeSitter: {
    kind: string;
    summary: string;
  };
}

/**
 * Get current code-intelligence status for the given cwd.
 */
export function getCodeIntelligenceStatus(cwd: string): CodeIntelligenceStatus {
  const lspState = getSessionLspService(cwd);
  const tsState = getSessionTreeSitterService(cwd);

  let lspServerCount = 0;
  let lspRunningCount = 0;
  let lspSummary = "";

  if (lspState.kind === "ready") {
    const servers = lspState.service.getProjectServers();
    lspServerCount = servers.length;
    lspRunningCount = servers.filter((s) => s.status === "running").length;
    lspSummary = `${lspRunningCount}/${lspServerCount} servers running`;
  } else {
    lspSummary = lspState.kind === "pending" ? "starting" : lspState.kind;
  }

  return {
    lsp: {
      kind: lspState.kind,
      serverCount: lspServerCount,
      runningServerCount: lspRunningCount,
      summary: lspSummary,
    },
    treeSitter: {
      kind: tsState.kind,
      summary: tsState.kind === "ready" ? "ready" : "unavailable",
    },
  };
}
