import type { LspClient } from "./client.ts";
import type { SymbolInformation, WorkspaceSymbol } from "./types.ts";

export async function managerWorkspaceSymbol(
  clients: Iterable<LspClient>,
  query: string,
): Promise<(SymbolInformation | WorkspaceSymbol)[] | null> {
  const all: (SymbolInformation | WorkspaceSymbol)[] = [];
  for (const client of clients) {
    if (client.status !== "running") continue;
    if (!client.serverCapabilities?.workspaceSymbolProvider) continue;
    const result = await client.workspaceSymbol(query);
    if (result) all.push(...result);
  }
  return all.length > 0 ? all : null;
}
