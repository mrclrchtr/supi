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
            "refactor.extract.function",
            "refactor.extract.constant",
            "refactor.extract.variable",
            "refactor.inline",
            "refactor.move",
            "refactor.rewrite",
            "source",
            "source.organizeImports",
            "source.fixAll",
            "source.removeUnused",
            "source.removeUnusedImports",
            "source.sortImports",
          ],
        },
      },
      dataSupport: true,
      // Never advertise `workspace.workspaceEdit.snippetEditSupport` (LSP 3.18):
      // snippet edits cannot become exact previewable text plans.
      // SuPi resolves only the edit property. Commands and other fields
      // must remain server-owned and are never advertised as resolvable.
      resolveSupport: { properties: ["edit"] },
    },
    publishDiagnostics: {
      relatedInformation: true,
      tagSupport: { valueSet: [1, 2] },
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
    // Servers may push edits through workspace/applyEdit. SuPi records them
    // only while previewing one command and always replies applied: false.
    applyEdit: true,
    configuration: true,
    workspaceFolders: true,
    workspaceEdit: {
      documentChanges: true,
    },
    diagnostics: {
      refreshSupport: true,
    },
  },
};
