// Stable LSP tool names shared across registration, guidance, and runtime state.

export const LSP_LOOKUP_TOOL = "lsp_lookup";
export const LSP_DOCUMENT_SYMBOLS_TOOL = "lsp_document_symbols";
export const LSP_WORKSPACE_SYMBOLS_TOOL = "lsp_workspace_symbols";
export const LSP_DIAGNOSTICS_TOOL = "lsp_diagnostics";
export const LSP_REFACTOR_TOOL = "lsp_refactor";
export const LSP_RECOVER_TOOL = "lsp_recover";

export const LSP_TOOL_NAMES = [
  LSP_LOOKUP_TOOL,
  LSP_DOCUMENT_SYMBOLS_TOOL,
  LSP_WORKSPACE_SYMBOLS_TOOL,
  LSP_DIAGNOSTICS_TOOL,
  LSP_REFACTOR_TOOL,
  LSP_RECOVER_TOOL,
] as const;

export type LspToolName = (typeof LSP_TOOL_NAMES)[number];
