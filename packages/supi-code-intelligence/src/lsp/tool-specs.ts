// Umbrella LSP tool definitions — tool metadata for lsp_* tool registration.
//
// In the interim phase, tool names and specs are owned locally so the umbrella
// does not need to reach into supi-lsp internals. Future cleanup can consolidate.

import { type TSchema, Type } from "typebox";

// ── Tool name constants ───────────────────────────────────────────────

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

// ── Parameter schemas ────────────────────────────────────────────────

const FileParam = Type.String({ description: "File path" });
const LineParam = Type.Number({ description: "1-based line", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based column", minimum: 1 });
const QueryParam = Type.String({ description: "Symbol query" });
const NewNameParam = Type.String({ description: "New name" });

const PositionParams = Type.Object(
  { file: FileParam, line: LineParam, character: CharacterParam },
  { additionalProperties: false },
);

const RenameParams = Type.Object(
  { file: FileParam, line: LineParam, character: CharacterParam, newName: NewNameParam },
  { additionalProperties: false },
);

const DocumentSymbolsParameters = Type.Object({ file: FileParam }, { additionalProperties: false });

const WorkspaceSymbolsParameters = Type.Object(
  { query: QueryParam },
  { additionalProperties: false },
);

const DiagnosticsParameters = Type.Object(
  { file: Type.Optional(FileParam) },
  { additionalProperties: false },
);

const RecoverParameters = Type.Object({}, { additionalProperties: false });

// ── Tool definition spec ──────────────────────────────────────────────

export interface LspToolDefinitionSpec {
  name: LspToolName;
  label: string;
  description: string;
  promptSnippet: string;
  basePromptGuidelines: string[];
  parameters: TSchema;
}

/**
 * LSP tool metadata specs.
 *
 * These define the public tool surface. Execution is delegated to
 * supi-lsp's service layer in tool-actions.ts.
 */
export const LSP_TOOL_DEFINITION_SPECS: readonly LspToolDefinitionSpec[] = [
  {
    name: LSP_HOVER_TOOL,
    label: "LSP Hover",
    description: "Semantic hover/type info at a file position.",
    promptSnippet: "lsp_hover — hover/type info",
    basePromptGuidelines: ["Use lsp_hover(file,line,character) for semantic hover/type info."],
    parameters: PositionParams,
  },
  {
    name: LSP_DEFINITION_TOOL,
    label: "LSP Definition",
    description: "Jump to a symbol definition at a file position.",
    promptSnippet: "lsp_definition — jump to definition",
    basePromptGuidelines: [
      "Use lsp_definition(file,line,character) to jump to a symbol definition.",
    ],
    parameters: PositionParams,
  },
  {
    name: LSP_REFERENCES_TOOL,
    label: "LSP References",
    description: "Find semantic references to a symbol at a file position.",
    promptSnippet: "lsp_references — semantic references",
    basePromptGuidelines: ["Use lsp_references(file,line,character) for semantic references."],
    parameters: PositionParams,
  },
  {
    name: LSP_IMPLEMENTATION_TOOL,
    label: "LSP Implementation",
    description: "Find implementations from a file position.",
    promptSnippet: "lsp_implementation — implementations",
    basePromptGuidelines: ["Use lsp_implementation(file,line,character) for implementations."],
    parameters: PositionParams,
  },
  {
    name: LSP_DOCUMENT_SYMBOLS_TOOL,
    label: "LSP Document Symbols",
    description: "List semantic declarations in one file.",
    promptSnippet: "lsp_document_symbols — one-file semantic outline",
    basePromptGuidelines: ["Use lsp_document_symbols(file) for one-file semantic declarations."],
    parameters: DocumentSymbolsParameters,
  },
  {
    name: LSP_WORKSPACE_SYMBOLS_TOOL,
    label: "LSP Workspace Symbols",
    description: "Find symbol declarations by name across the project.",
    promptSnippet: "lsp_workspace_symbols — project symbol lookup",
    basePromptGuidelines: ["Use lsp_workspace_symbols(query) to find declarations by name."],
    parameters: WorkspaceSymbolsParameters,
  },
  {
    name: LSP_DIAGNOSTICS_TOOL,
    label: "LSP Diagnostics",
    description: "Show semantic diagnostics for one file or the workspace.",
    promptSnippet: "lsp_diagnostics — semantic diagnostics",
    basePromptGuidelines: ["Use lsp_diagnostics(file?) for semantic diagnostics."],
    parameters: DiagnosticsParameters,
  },
  {
    name: LSP_RENAME_TOOL,
    label: "LSP Rename",
    description: "Plan a semantic rename from a file position.",
    promptSnippet: "lsp_rename — semantic rename plan",
    basePromptGuidelines: [
      "Use lsp_rename(file,line,character,newName) to plan a semantic rename.",
    ],
    parameters: RenameParams,
  },
  {
    name: LSP_CODE_ACTIONS_TOOL,
    label: "LSP Code Actions",
    description: "List code fixes/refactors at a file position.",
    promptSnippet: "lsp_code_actions — quick fixes/refactors",
    basePromptGuidelines: ["Use lsp_code_actions(file,line,character) for quick fixes/refactors."],
    parameters: PositionParams,
  },
  {
    name: LSP_RECOVER_TOOL,
    label: "LSP Recover",
    description: "Refresh LSP diagnostics after workspace changes.",
    promptSnippet: "lsp_recover — refresh stale diagnostics",
    basePromptGuidelines: [
      "Use lsp_recover() when diagnostics look stale after workspace changes.",
    ],
    parameters: RecoverParameters,
  },
];
