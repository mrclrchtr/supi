// Server capability action label helpers — maps LSP capabilities to readable action labels.

import type { ServerCapabilities } from "../config/types.ts";

interface LspServerSupportedActionSpec {
  label: string;
  isSupported: (capabilities: ServerCapabilities | null | undefined) => boolean;
}

const LSP_SERVER_SUPPORTED_ACTION_SPECS: readonly LspServerSupportedActionSpec[] = [
  {
    label: "diagnostics [optional file]",
    isSupported: () => true,
  },
  {
    label: "hover(file,line,char)",
    isSupported: (capabilities) => Boolean(capabilities?.hoverProvider),
  },
  {
    label: "definition(file,line,char)",
    isSupported: (capabilities) => Boolean(capabilities?.definitionProvider),
  },
  {
    label: "references(file,line,char)",
    isSupported: (capabilities) => Boolean(capabilities?.referencesProvider),
  },
  {
    label: "implementation(file,line,char)",
    isSupported: (capabilities) => Boolean(capabilities?.implementationProvider),
  },
  {
    label: "symbols(file)",
    isSupported: (capabilities) => Boolean(capabilities?.documentSymbolProvider),
  },
  {
    label: "workspace_symbols(query)",
    isSupported: (capabilities) => Boolean(capabilities?.workspaceSymbolProvider),
  },
  {
    label: "rename(file,line,char,newName)",
    isSupported: (capabilities) => Boolean(capabilities?.renameProvider),
  },
  {
    label: "code_actions(file,line,char)",
    isSupported: (capabilities) => Boolean(capabilities?.codeActionProvider),
  },
] as const;

/**
 * Get the list of supported LSP server actions based on capabilities.
 */
export function getSupportedLspServerActions(
  capabilities: ServerCapabilities | null | undefined,
): string[] {
  if (!capabilities) return [];
  return LSP_SERVER_SUPPORTED_ACTION_SPECS.filter((spec) => spec.isSupported(capabilities)).map(
    (spec) => spec.label,
  );
}
