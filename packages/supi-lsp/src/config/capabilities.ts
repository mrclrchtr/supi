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
