import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getSessionLspService } from "../session/service-registry.ts";
import type { LspToolPromptSurfaceMap } from "./guidance.ts";
import {
  LSP_DIAGNOSTICS_TOOL,
  LSP_DOCUMENT_SYMBOLS_TOOL,
  LSP_LOOKUP_TOOL,
  LSP_RECOVER_TOOL,
  LSP_REFACTOR_TOOL,
  LSP_WORKSPACE_SYMBOLS_TOOL,
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

const LookupKindEnum = StringEnum(["hover", "definition", "references", "implementation"] as const);

const RefactorKindEnum = StringEnum(["rename", "code_actions"] as const);

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

/** Register the expert LSP toolset. Tools are re-registered on session_start to refresh guidance. */
export function registerLspTools(pi: ExtensionAPI, promptSurfaces: LspToolPromptSurfaceMap): void {
  const lookupSurface = promptSurfaces[LSP_LOOKUP_TOOL];
  pi.registerTool({
    name: LSP_LOOKUP_TOOL,
    label: "LSP Lookup",
    description: lookupSurface.description,
    promptSnippet: lookupSurface.promptSnippet,
    promptGuidelines: lookupSurface.promptGuidelines,
    parameters: LookupParameters,
    execute: createToolExecutor((service, cwd, params) =>
      executeLookup(service, cwd, params as Parameters<typeof executeLookup>[2]),
    ),
  });

  const documentSymbolsSurface = promptSurfaces[LSP_DOCUMENT_SYMBOLS_TOOL];
  pi.registerTool({
    name: LSP_DOCUMENT_SYMBOLS_TOOL,
    label: "LSP Document Symbols",
    description: documentSymbolsSurface.description,
    promptSnippet: documentSymbolsSurface.promptSnippet,
    promptGuidelines: documentSymbolsSurface.promptGuidelines,
    parameters: DocumentSymbolsParameters,
    execute: createToolExecutor((service, cwd, params) =>
      executeDocumentSymbols(service, cwd, params as Parameters<typeof executeDocumentSymbols>[2]),
    ),
  });

  const workspaceSymbolsSurface = promptSurfaces[LSP_WORKSPACE_SYMBOLS_TOOL];
  pi.registerTool({
    name: LSP_WORKSPACE_SYMBOLS_TOOL,
    label: "LSP Workspace Symbols",
    description: workspaceSymbolsSurface.description,
    promptSnippet: workspaceSymbolsSurface.promptSnippet,
    promptGuidelines: workspaceSymbolsSurface.promptGuidelines,
    parameters: WorkspaceSymbolsParameters,
    execute: createToolExecutor((service, cwd, params) =>
      executeWorkspaceSymbols(
        service,
        cwd,
        params as Parameters<typeof executeWorkspaceSymbols>[2],
      ),
    ),
  });

  const diagnosticsSurface = promptSurfaces[LSP_DIAGNOSTICS_TOOL];
  pi.registerTool({
    name: LSP_DIAGNOSTICS_TOOL,
    label: "LSP Diagnostics",
    description: diagnosticsSurface.description,
    promptSnippet: diagnosticsSurface.promptSnippet,
    promptGuidelines: diagnosticsSurface.promptGuidelines,
    parameters: DiagnosticsParameters,
    execute: createToolExecutor((service, cwd, params) =>
      executeDiagnostics(service, cwd, params as Parameters<typeof executeDiagnostics>[2]),
    ),
  });

  const refactorSurface = promptSurfaces[LSP_REFACTOR_TOOL];
  pi.registerTool({
    name: LSP_REFACTOR_TOOL,
    label: "LSP Refactor",
    description: refactorSurface.description,
    promptSnippet: refactorSurface.promptSnippet,
    promptGuidelines: refactorSurface.promptGuidelines,
    parameters: RefactorParameters,
    execute: createToolExecutor((service, cwd, params) =>
      executeRefactor(service, cwd, params as Parameters<typeof executeRefactor>[2]),
    ),
  });

  const recoverSurface = promptSurfaces[LSP_RECOVER_TOOL];
  pi.registerTool({
    name: LSP_RECOVER_TOOL,
    label: "LSP Recover",
    description: recoverSurface.description,
    promptSnippet: recoverSurface.promptSnippet,
    promptGuidelines: recoverSurface.promptGuidelines,
    parameters: RecoverParameters,
    execute: createRecoverToolExecutor(),
  });
}

function getReadyService(cwd: string) {
  const state = getSessionLspService(cwd);
  return state.kind === "ready" ? state.service : null;
}

function describeUnavailableService(cwd: string): string {
  const state = getSessionLspService(cwd);
  switch (state.kind) {
    case "pending":
      return "LSP is still starting for this workspace. Retry in a moment.";
    case "inactive":
      return `LSP is inactive on the current session branch for ${cwd}.`;
    case "disabled":
      return `LSP is disabled for ${cwd}.`;
    case "unavailable":
      return state.reason;
    default:
      return "LSP not initialized. Start a new session first.";
  }
}

function createToolExecutor(
  run: (
    service: NonNullable<ReturnType<typeof getReadyService>>,
    cwd: string,
    params: unknown,
  ) => Promise<string>,
) {
  // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
  return async (
    _toolCallId: string,
    params: unknown,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: ExtensionContext,
  ) => {
    const service = getReadyService(ctx.cwd);
    const text = service
      ? await run(service, ctx.cwd, params)
      : describeUnavailableService(ctx.cwd);
    return makeTextResult(text);
  };
}

function createRecoverToolExecutor() {
  // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
  return async (
    _toolCallId: string,
    _params: unknown,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: ExtensionContext,
  ) => {
    const service = getReadyService(ctx.cwd);
    const text = service ? await executeRecover(service) : describeUnavailableService(ctx.cwd);
    return makeTextResult(text);
  };
}

function makeTextResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: {},
  };
}
