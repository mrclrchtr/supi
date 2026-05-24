// LSP tool name constants — shared across tool registration, guidance, and state.

export const LSP_HOVER_TOOL = "lsp_hover";
export const LSP_DEFINITION_TOOL = "lsp_definition";
export const LSP_REFERENCES_TOOL = "lsp_references";
export const LSP_IMPLEMENTATION_TOOL = "lsp_implementation";
export const LSP_DOCUMENT_SYMBOLS_TOOL = "lsp_document_symbols";
export const LSP_WORKSPACE_SYMBOLS_TOOL = "lsp_workspace_symbols";
export const LSP_DIAGNOSTICS_TOOL = "lsp_diagnostics";
export const LSP_RENAME_TOOL = "lsp_rename";
export const LSP_CODE_ACTIONS_TOOL = "lsp_code_actions";
export const LSP_RECOVER_TOOL = "lsp_recover";

export const LSP_TOOL_NAMES = [
  LSP_HOVER_TOOL,
  LSP_DEFINITION_TOOL,
  LSP_REFERENCES_TOOL,
  LSP_IMPLEMENTATION_TOOL,
  LSP_DOCUMENT_SYMBOLS_TOOL,
  LSP_WORKSPACE_SYMBOLS_TOOL,
  LSP_DIAGNOSTICS_TOOL,
  LSP_RENAME_TOOL,
  LSP_CODE_ACTIONS_TOOL,
  LSP_RECOVER_TOOL,
] as const;

export type LspToolName = (typeof LSP_TOOL_NAMES)[number];
