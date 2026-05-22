import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { ServerCapabilities } from "../config/types.ts";
import type { SessionLspService } from "../session/service-registry.ts";
import {
  LSP_DIAGNOSTICS_TOOL,
  LSP_DOCUMENT_SYMBOLS_TOOL,
  LSP_LOOKUP_TOOL,
  LSP_RECOVER_TOOL,
  LSP_REFACTOR_TOOL,
  LSP_WORKSPACE_SYMBOLS_TOOL,
  type LspToolName,
} from "./names.ts";
import {
  executeDiagnostics,
  executeDocumentSymbols,
  executeLookup,
  executeRecover,
  executeRefactor,
  executeWorkspaceSymbols,
} from "./service-actions.ts";

const FileParam = Type.String({ description: "File path (relative or absolute)" });
const LineParam = Type.Number({ description: "1-based line number", minimum: 1 });
const CharacterParam = Type.Number({ description: "1-based column number", minimum: 1 });
const QueryParam = Type.String({ description: "Symbol query string" });
const NewNameParam = Type.String({ description: "New name for rename" });

export const LSP_LOOKUP_KIND_NAMES = [
  "hover",
  "definition",
  "references",
  "implementation",
] as const;
export const LSP_REFACTOR_KIND_NAMES = ["rename", "code_actions"] as const;

const LookupKindEnum = StringEnum(LSP_LOOKUP_KIND_NAMES);
const RefactorKindEnum = StringEnum(LSP_REFACTOR_KIND_NAMES);

const LookupParameters = Type.Object(
  {
    kind: LookupKindEnum,
    file: FileParam,
    line: LineParam,
    character: CharacterParam,
  },
  { additionalProperties: false },
);

const DocumentSymbolsParameters = Type.Object(
  {
    file: FileParam,
  },
  { additionalProperties: false },
);

const WorkspaceSymbolsParameters = Type.Object(
  {
    query: QueryParam,
  },
  { additionalProperties: false },
);

const DiagnosticsParameters = Type.Object(
  {
    file: Type.Optional(FileParam),
  },
  { additionalProperties: false },
);

const RefactorParameters = Type.Object(
  {
    kind: RefactorKindEnum,
    file: FileParam,
    line: LineParam,
    character: CharacterParam,
    newName: Type.Optional(NewNameParam),
  },
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
    name: LSP_LOOKUP_TOOL,
    label: "LSP Lookup",
    description:
      "Language Server Protocol lookup tool — semantic hover, definition, references, and implementation for supported files. Use lsp_lookup when you know the file and 1-based line/character position and need semantic drill-down rather than text search.",
    promptSnippet:
      "lsp_lookup — semantic hover/definition/references/implementation at a known file position",
    basePromptGuidelines: [
      'Use lsp_lookup with `kind: "hover"` for semantic type or symbol information at a known `file`, `line`, and `character`.',
      'Use lsp_lookup with `kind: "definition"`, `"references"`, or `"implementation"` for semantic navigation at a known position.',
      "Use lsp_lookup after code_brief, code_map, or tree_sitter has already narrowed the target file and position.",
    ],
    parameters: LookupParameters,
    run: (service, cwd, params) =>
      executeLookup(service, cwd, params as Parameters<typeof executeLookup>[2]),
    includeCoverageGuidelines: true,
  },
  {
    name: LSP_DOCUMENT_SYMBOLS_TOOL,
    label: "LSP Document Symbols",
    description:
      "Language Server Protocol document symbols tool — list semantic declarations in one supported file. Use lsp_document_symbols when you need a symbol-aware outline rather than raw text structure.",
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
      "Language Server Protocol workspace symbols tool — semantic symbol-name lookup across the current project. Use lsp_workspace_symbols to find declarations by name before opening a specific file.",
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
      "Language Server Protocol diagnostics tool — current diagnostics for one file or a workspace summary. Use lsp_diagnostics for semantic compiler or language-server issues instead of guessing from text alone.",
    promptSnippet: "lsp_diagnostics — current diagnostics for one file or the workspace",
    basePromptGuidelines: [
      "Use lsp_diagnostics(file?) when you need current diagnostics for one file or a workspace-level summary.",
    ],
    parameters: DiagnosticsParameters,
    run: (service, cwd, params) =>
      executeDiagnostics(service, cwd, params as Parameters<typeof executeDiagnostics>[2]),
  },
  {
    name: LSP_REFACTOR_TOOL,
    label: "LSP Refactor",
    description:
      "Language Server Protocol refactor tool — semantic rename planning and code actions at a known file position. Use lsp_refactor when you need language-server-backed edits or quick-fix suggestions.",
    promptSnippet: "lsp_refactor — semantic rename planning and code actions at a known position",
    basePromptGuidelines: [
      'Use lsp_refactor with `kind: "rename"` for semantic rename planning at a known `file`, `line`, and `character`.',
      'Use lsp_refactor with `kind: "code_actions"` for semantic fixes or refactors at a known position.',
    ],
    parameters: RefactorParameters,
    run: (service, cwd, params) =>
      executeRefactor(service, cwd, params as Parameters<typeof executeRefactor>[2]),
  },
  {
    name: LSP_RECOVER_TOOL,
    label: "LSP Recover",
    description:
      "Language Server Protocol recover tool — refresh diagnostics after workspace changes and stale language-server state. Use lsp_recover when new files, generated types, or config updates leave diagnostics out of sync.",
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
