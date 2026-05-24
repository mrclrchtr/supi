import { type TSchema, Type } from "typebox";
import type { ServerCapabilities } from "../config/types.ts";
import type { SessionLspService } from "../session/service-registry.ts";
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
} from "./names.ts";
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
} from "./service-actions.ts";

// Shared parameter builders
const FileParam = Type.String({ description: "File path (relative or absolute)" });
const LineParam = Type.Number({ description: "1-based line number", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based column number", minimum: 1 });
const QueryParam = Type.String({ description: "Symbol query string" });
const NewNameParam = Type.String({ description: "New name for rename" });

// Parameter schemas
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

export interface LspToolDefinitionSpec {
  name: LspToolName;
  label: string;
  description: string;
  promptSnippet: string;
  basePromptGuidelines: string[];
  parameters: TSchema;
  run: (service: SessionLspService, cwd: string, params: unknown) => Promise<string>;
  includeCoverageGuidelines?: boolean;
}

export const LSP_TOOL_DEFINITION_SPECS = [
  {
    name: LSP_HOVER_TOOL,
    label: "LSP Hover",
    description:
      "Semantic type or symbol information at a known file position. Returns hover content including type annotations, documentation, and signature info for the symbol at the given location.",
    promptSnippet: "lsp_hover — semantic type information at a given position",
    basePromptGuidelines: [
      "Use lsp_hover with `file`, `line`, and `character` for semantic type or symbol information at a known position.",
    ],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeHover(service, cwd, params as Parameters<typeof executeHover>[2]),
    includeCoverageGuidelines: true,
  },
  {
    name: LSP_DEFINITION_TOOL,
    label: "LSP Definition",
    description:
      "Navigate to the definition of a symbol at a known file position. Returns the file and location where the symbol is declared.",
    promptSnippet: "lsp_definition — go to definition at a known position",
    basePromptGuidelines: [
      "Use lsp_definition with `file`, `line`, and `character` for semantic navigation to a symbol's definition.",
    ],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeDefinition(service, cwd, params as Parameters<typeof executeDefinition>[2]),
    includeCoverageGuidelines: true,
  },
  {
    name: LSP_REFERENCES_TOOL,
    label: "LSP References",
    description:
      "Find all references to a symbol at a known file position. Returns a list of locations across the project where the symbol is referenced.",
    promptSnippet: "lsp_references — find all references to a symbol",
    basePromptGuidelines: [
      "Use lsp_references with `file`, `line`, and `character` to find all semantic references to a symbol.",
    ],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeReferences(service, cwd, params as Parameters<typeof executeReferences>[2]),
    includeCoverageGuidelines: true,
  },
  {
    name: LSP_IMPLEMENTATION_TOOL,
    label: "LSP Implementation",
    description:
      "Find concrete implementations of an interface, abstract class, or method at a known position. Returns the locations where the declaration is implemented.",
    promptSnippet: "lsp_implementation — find implementations of an interface or method",
    basePromptGuidelines: [
      "Use lsp_implementation with `file`, `line`, and `character` to find which concrete types implement a declaration.",
    ],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeImplementation(service, cwd, params as Parameters<typeof executeImplementation>[2]),
    includeCoverageGuidelines: true,
  },
  {
    name: LSP_DOCUMENT_SYMBOLS_TOOL,
    label: "LSP Document Symbols",
    description:
      "List semantic declarations in one supported file. Use lsp_document_symbols when you need a symbol-aware outline rather than raw text structure.",
    promptSnippet: "lsp_document_symbols — semantic declarations for one supported file",
    basePromptGuidelines: [
      "Use lsp_document_symbols(file) for semantic declarations in one supported file.",
    ],
    parameters: DocumentSymbolsParameters,
    run: (service, cwd, params) =>
      executeDocumentSymbols(service, cwd, params as Parameters<typeof executeDocumentSymbols>[2]),
  },
  {
    name: LSP_WORKSPACE_SYMBOLS_TOOL,
    label: "LSP Workspace Symbols",
    description:
      "Semantic symbol-name lookup across the current project. Use lsp_workspace_symbols to find declarations by name before opening a specific file.",
    promptSnippet: "lsp_workspace_symbols — semantic symbol-name lookup across the project",
    basePromptGuidelines: [
      "Use lsp_workspace_symbols(query) for semantic symbol-name lookup across the current project.",
    ],
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
    description:
      "Current diagnostics for one file or a workspace summary. Use lsp_diagnostics for semantic compiler or language-server issues instead of guessing from text alone.",
    promptSnippet: "lsp_diagnostics — current diagnostics for one file or the workspace",
    basePromptGuidelines: [
      "Use lsp_diagnostics(file?) when you need current diagnostics for one file or a workspace-level summary.",
    ],
    parameters: DiagnosticsParameters,
    run: (service, cwd, params) =>
      executeDiagnostics(service, cwd, params as Parameters<typeof executeDiagnostics>[2]),
  },
  {
    name: LSP_RENAME_TOOL,
    label: "LSP Rename",
    description:
      "Semantic rename planning at a known file position. Returns the workspace edits needed to rename a symbol across the project. Requires newName.",
    promptSnippet: "lsp_rename — semantic rename planning at a known position",
    basePromptGuidelines: [
      "Use lsp_rename with `file`, `line`, `character`, and `newName` for a semantic rename across the workspace.",
    ],
    parameters: RenameParams,
    run: (service, cwd, params) =>
      executeRename(service, cwd, params as Parameters<typeof executeRename>[2]),
    includeCoverageGuidelines: true,
  },
  {
    name: LSP_CODE_ACTIONS_TOOL,
    label: "LSP Code Actions",
    description:
      "Quick-fix suggestions and refactors at a known file position. Returns available code actions including automatic fixes, suggestions, and refactoring options.",
    promptSnippet: "lsp_code_actions — semantic fixes or refactors at a known position",
    basePromptGuidelines: [
      "Use lsp_code_actions with `file`, `line`, and `character` for semantic fixes or refactors.",
    ],
    parameters: PositionParams,
    run: (service, cwd, params) =>
      executeCodeActions(service, cwd, params as Parameters<typeof executeCodeActions>[2]),
    includeCoverageGuidelines: true,
  },
  {
    name: LSP_RECOVER_TOOL,
    label: "LSP Recover",
    description:
      "Refresh diagnostics after workspace changes and stale language-server state. Use lsp_recover when new files, generated types, or config updates leave diagnostics out of sync.",
    promptSnippet: "lsp_recover — refresh stale diagnostics after workspace changes",
    basePromptGuidelines: [
      "Use lsp_recover() when diagnostics look stale after workspace-level changes or generated-file updates.",
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

export function getSupportedLspServerActions(
  capabilities: ServerCapabilities | null | undefined,
): string[] {
  if (!capabilities) return [];

  return LSP_SERVER_SUPPORTED_ACTION_SPECS.filter((spec) => spec.isSupported(capabilities)).map(
    (spec) => spec.label,
  );
}
