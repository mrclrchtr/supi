// LSP client capabilities — declares what we support to servers.

import type { ClientCapabilities } from "./types.ts";

export const CLIENT_CAPABILITIES: ClientCapabilities = {
  textDocument: {
    synchronization: {
      didSave: true,
      dynamicRegistration: false,
    },
    hover: {
      contentFormat: ["markdown", "plaintext"],
      dynamicRegistration: false,
    },
    definition: {
      dynamicRegistration: false,
      linkSupport: true,
    },
    references: {
      dynamicRegistration: false,
    },
    documentSymbol: {
      dynamicRegistration: false,
      hierarchicalDocumentSymbolSupport: true,
    },
    rename: {
      dynamicRegistration: false,
      prepareSupport: true,
    },
    codeAction: {
      dynamicRegistration: false,
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: [
            "quickfix",
            "refactor",
            "refactor.extract",
            "refactor.inline",
            "refactor.rewrite",
            "source",
            "source.organizeImports",
            "source.fixAll",
          ],
        },
      },
    },
    publishDiagnostics: {
      relatedInformation: true,
      versionSupport: true,
    },
    diagnostic: {
      dynamicRegistration: false,
      relatedDocumentSupport: true,
    },
  },
  workspace: {
    workspaceFolders: false,
    diagnostics: {
      refreshSupport: false,
    },
  },
};

// ── Server action labels ──────────────────────────────────────────────

interface LspServerSupportedActionSpec {
  label: string;
  isSupported: (
    capabilities: import("../config/types.ts").ServerCapabilities | null | undefined,
  ) => boolean;
}

const LSP_SERVER_SUPPORTED_ACTION_SPECS: readonly LspServerSupportedActionSpec[] = [
  { label: "diagnostics [optional file]", isSupported: () => true },
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

export function getSupportedLspServerActions(
  capabilities: import("../config/types.ts").ServerCapabilities | null | undefined,
): string[] {
  if (!capabilities) return [];
  return LSP_SERVER_SUPPORTED_ACTION_SPECS.filter((spec) => spec.isSupported(capabilities)).map(
    (spec) => spec.label,
  );
}
