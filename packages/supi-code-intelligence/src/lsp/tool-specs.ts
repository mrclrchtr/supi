// Single source of truth for the LSP-focused tool surface in the umbrella package.
//
// Tool registration, guidance, and parameter validation derive
// from these specs so the public surface does not drift from the
// metadata that drives it.

import type { SessionLspService } from "@mrclrchtr/supi-lsp/api";
import { type TSchema, Type } from "typebox";
import {
  executeCodeActions,
  executeDefinition,
  executeDiagnostics,
  executeDocumentSymbols,
  executeHover,
  executeImplementation,
  executeRecover,
  executeReferences,
  executeRename,
  executeWorkspaceSymbols,
} from "./tool-actions.ts";
import {
  LSP_CODE_ACTIONS_TOOL,
  LSP_DEFINITION_TOOL,
  LSP_DIAGNOSTICS_TOOL,
  LSP_DOCUMENT_SYMBOLS_TOOL,
  LSP_HOVER_TOOL,
  LSP_IMPLEMENTATION_TOOL,
  LSP_RECOVER_TOOL,
  LSP_REFERENCES_TOOL,
  LSP_RENAME_TOOL,
  LSP_WORKSPACE_SYMBOLS_TOOL,
  type LspToolName,
} from "./tool-names.ts";

// ── Shared parameter builders ─────────────────────────────────────────

const FileParam = Type.String({ description: "File path" });
const LineParam = Type.Number({ description: "1-based line", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based column", minimum: 1 });
const QueryParam = Type.String({ description: "Symbol query" });
const NewNameParam = Type.String({ description: "New name" });

// ── Parameter schemas ─────────────────────────────────────────────────

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
  run: (service: SessionLspService, cwd: string, params: unknown) => Promise<string>;
}

export const LSP_TOOL_DEFINITION_SPECS = [
  {
    name: LSP_HOVER_TOOL,
    label: "LSP Hover",
    description: "Semantic hover/type info at a file position.",
    promptSnippet: "lsp_hover — hover/type info",
    basePromptGuidelines: ["Use lsp_hover(file,line,character) for semantic hover/type info."],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeHover(service, cwd, params as Parameters<typeof executeHover>[2]),
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
    run: (service, cwd, params) =>
      executeDefinition(service, cwd, params as Parameters<typeof executeDefinition>[2]),
  },
  {
    name: LSP_REFERENCES_TOOL,
    label: "LSP References",
    description: "Find semantic references to a symbol at a file position.",
    promptSnippet: "lsp_references — semantic references",
    basePromptGuidelines: ["Use lsp_references(file,line,character) for semantic references."],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeReferences(service, cwd, params as Parameters<typeof executeReferences>[2]),
  },
  {
    name: LSP_IMPLEMENTATION_TOOL,
    label: "LSP Implementation",
    description: "Find implementations from a file position.",
    promptSnippet: "lsp_implementation — implementations",
    basePromptGuidelines: ["Use lsp_implementation(file,line,character) for implementations."],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeImplementation(service, cwd, params as Parameters<typeof executeImplementation>[2]),
  },
  {
    name: LSP_DOCUMENT_SYMBOLS_TOOL,
    label: "LSP Document Symbols",
    description: "List semantic declarations in one file.",
    promptSnippet: "lsp_document_symbols — one-file semantic outline",
    basePromptGuidelines: ["Use lsp_document_symbols(file) for one-file semantic declarations."],
    parameters: DocumentSymbolsParameters,
    run: (service, cwd, params) =>
      executeDocumentSymbols(service, cwd, params as Parameters<typeof executeDocumentSymbols>[2]),
  },
  {
    name: LSP_WORKSPACE_SYMBOLS_TOOL,
    label: "LSP Workspace Symbols",
    description: "Find symbol declarations by name across the project.",
    promptSnippet: "lsp_workspace_symbols — project symbol lookup",
    basePromptGuidelines: ["Use lsp_workspace_symbols(query) to find declarations by name."],
    parameters: WorkspaceSymbolsParameters,
    run: (service, cwd, params) =>
      executeWorkspaceSymbols(
        service,
        cwd,
        params as Parameters<typeof executeWorkspaceSymbols>[2],
      ),
  },
  {
    name: LSP_DIAGNOSTICS_TOOL,
    label: "LSP Diagnostics",
    description: "Show semantic diagnostics for one file or the workspace.",
    promptSnippet: "lsp_diagnostics — semantic diagnostics",
    basePromptGuidelines: ["Use lsp_diagnostics(file?) for semantic diagnostics."],
    parameters: DiagnosticsParameters,
    run: (service, cwd, params) =>
      executeDiagnostics(service, cwd, params as Parameters<typeof executeDiagnostics>[2]),
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
    run: (service, cwd, params) =>
      executeRename(service, cwd, params as Parameters<typeof executeRename>[2]),
  },
  {
    name: LSP_CODE_ACTIONS_TOOL,
    label: "LSP Code Actions",
    description: "List code fixes/refactors at a file position.",
    promptSnippet: "lsp_code_actions — quick fixes/refactors",
    basePromptGuidelines: ["Use lsp_code_actions(file,line,character) for quick fixes/refactors."],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeCodeActions(service, cwd, params as Parameters<typeof executeCodeActions>[2]),
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
    run: (service) => executeRecover(service),
  },
] as const satisfies readonly LspToolDefinitionSpec[];

const LSP_TOOL_SPEC_MAP = new Map<LspToolName, LspToolDefinitionSpec>(
  LSP_TOOL_DEFINITION_SPECS.map((spec) => [spec.name, spec]),
);

export function getLspToolDefinitionSpec(toolName: LspToolName): LspToolDefinitionSpec {
  const spec = LSP_TOOL_SPEC_MAP.get(toolName);
  if (!spec) {
    throw new Error(`Unknown LSP tool: ${toolName}`);
  }
  return spec;
}
