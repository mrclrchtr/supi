// LSP client capabilities — declares what we support to servers.

import type { ClientCapabilities } from "./types.ts";

export const CLIENT_CAPABILITIES: ClientCapabilities = {
  general: {
    positionEncodings: ["utf-16"],
  },
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
      // Dynamic registration lets servers such as pyright-langserver register
      // `textDocument/diagnostic` support after initialization. Probes show
      // only Pyright acts on this global flag among the built-in servers.
      dynamicRegistration: true,
      relatedDocumentSupport: true,
    },
  },
  window: {
    workDoneProgress: true,
  },
  workspace: {
    workspaceFolders: true,
    workspaceEdit: {
      documentChanges: true,
    },
    diagnostics: {
      refreshSupport: true,
    },
  },
};
