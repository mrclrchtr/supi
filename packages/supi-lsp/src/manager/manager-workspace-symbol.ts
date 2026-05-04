import type { LspClient } from "../client/client.ts";
import type { SymbolInformation, WorkspaceSymbol } from "../types.ts";

export async function managerWorkspaceSymbol(
  clients: Iterable<LspClient>,
  query: string,
): Promise<(SymbolInformation | WorkspaceSymbol)[] | null> {
  const all: (SymbolInformation | WorkspaceSymbol)[] = [];
  let hasSupport = false;
  for (const client of clients) {
    if (client.status !== "running") continue;
    if (!client.serverCapabilities?.workspaceSymbolProvider) continue;
    hasSupport = true;
    const result = await client.workspaceSymbol(query);
    if (result) all.push(...result);
  }
  return hasSupport ? all : null;
}
