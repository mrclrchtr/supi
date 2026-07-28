// LSP semantic provider adapter — wraps WorkspaceLspRuntime into the shared
// SemanticProvider contract from supi-code-runtime.

import { readFile } from "node:fs/promises";
import {
  type CodeLocation,
  type CodePosition,
  type CodeQueryResult,
  type CodeSymbol,
  completedCodeQuery,
  type DeclarationNesting,
  type DocumentCodeSymbol,
  mapCodeQueryResult,
  partialCodeQuery,
  type RefactorRequest,
  type RefactorResult,
  type SemanticProvider,
  type SourceRange,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import type {
  CodeAction,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkupContent,
  SymbolInformation,
} from "../config/types.ts";
import type { WorkspaceLspRuntime } from "../session/runtime-registry.ts";
import {
  collectCodeActionResults,
  isDeleteDeadCodeCodeAction,
  isExtractFunctionCodeAction,
  isExtractVariableCodeAction,
  isUpdateImportsCodeAction,
  runFilteredCodeActionRefactor,
  runRenameRefactor,
} from "./refactor-planning.ts";

/**
 * Create a SemanticProvider backed by a WorkspaceLspRuntime.
 * Maps LSP types into the shared code-runtime types.
 */
export function createLspSemanticProvider(lsp: WorkspaceLspRuntime): SemanticProvider {
  return {
    async definition(
      filePath: string,
      position: CodePosition,
    ): Promise<CodeQueryResult<CodeLocation[]>> {
      return mapCodeQueryResult(await lsp.definition(filePath, position), mapLocations);
    },

    async hover(
      filePath: string,
      position: CodePosition,
    ): Promise<CodeQueryResult<{ contents: string; range?: SourceRange } | null>> {
      return mapCodeQueryResult(await lsp.hover(filePath, position), (hover) =>
        hover ? convertLspHover(hover) : null,
      );
    },

    async references(
      filePath: string,
      position: CodePosition,
    ): Promise<CodeQueryResult<CodeLocation[]>> {
      return mapCodeQueryResult(await lsp.references(filePath, position), mapLocations);
    },

    async implementation(
      filePath: string,
      position: CodePosition,
    ): Promise<CodeQueryResult<CodeLocation[]>> {
      return mapCodeQueryResult(await lsp.implementation(filePath, position), mapLocations);
    },

    async documentSymbols(filePath: string): Promise<CodeQueryResult<DocumentCodeSymbol[]>> {
      const result = await lsp.documentSymbols(filePath);
      if (result.kind === "unavailable") return unavailableCodeQuery(result.reason);
      const sourceLines = await readSourceLines(filePath);
      const symbols = flattenDocumentSymbols(result.data, filePath, null, {
        sourceLines,
        nesting: "top-level",
      });
      return result.kind === "partial"
        ? partialCodeQuery(symbols, result.reason)
        : completedCodeQuery(symbols);
    },

    async workspaceSymbols(query: string): Promise<CodeQueryResult<CodeSymbol[]>> {
      return mapCodeQueryResult(await lsp.workspaceSymbol(query), (results) =>
        results.map((symbol) => toCodeSymbol(symbol as SymbolInformation)),
      );
    },

    async refactor(request: RefactorRequest): Promise<RefactorResult> {
      switch (request.operation) {
        case "rename_symbol":
          if (!request.newName) {
            return {
              kind: "unavailable",
              reason: 'Refactor operation "rename_symbol" requires `newName`.',
            };
          }
          return runRenameRefactor(lsp, request.file, request.position, request.newName);
        case "extract_function":
          return runExtractRefactor(lsp, request, "extract_function", isExtractFunctionCodeAction);
        case "extract_variable":
          return runExtractRefactor(lsp, request, "extract_variable", isExtractVariableCodeAction);
        case "update_imports":
          return runFilteredCodeActionRefactor({
            lsp,
            file: request.file,
            position: request.position,
            operation: "update_imports",
            matches: isUpdateImportsCodeAction,
          });
        case "delete_dead_code":
          return runFilteredCodeActionRefactor({
            lsp,
            file: request.file,
            position: request.position,
            operation: "delete_dead_code",
            matches: isDeleteDeadCodeCodeAction,
          });
        case "rename_file":
        case "move_file":
          // TODO(TNDM-D9FEHR): Replace this explicit unavailable result once
          // shared file/resource edits and rollback semantics exist.
          return {
            kind: "unavailable",
            reason: `Refactor operation "${request.operation}" is not supported yet. File/resource operations are deferred.`,
          };
      }

      return {
        kind: "unavailable",
        reason: `Refactor operation "${request.operation}" is not supported by the active semantic provider.`,
      };
    },

    async rename(file: string, position: CodePosition, newName: string): Promise<RefactorResult> {
      return runRenameRefactor(lsp, file, position, newName);
    },

    async codeActions(file: string, position: CodePosition): Promise<RefactorResult[]> {
      const actions = await lsp.codeActions(file, position);
      if (!actions) return [];
      return collectCodeActionResults(actions);
    },
  };
}

function runExtractRefactor(
  lsp: WorkspaceLspRuntime,
  request: RefactorRequest,
  operation: "extract_function" | "extract_variable",
  matches: (action: CodeAction) => boolean,
): Promise<RefactorResult> | RefactorResult {
  if (!request.range) {
    return {
      kind: "unavailable",
      reason: `Refactor operation "${operation}" requires \`range\`.`,
    };
  }

  return runFilteredCodeActionRefactor({
    lsp,
    file: request.file,
    position: request.position,
    range: request.range,
    operation,
    matches,
  });
}

// ── Type conversion helpers ───────────────────────────────────────────

function mapLocations(value: Location | Location[] | LocationLink[] | null): CodeLocation[] {
  if (!value) return [];
  const locations = Array.isArray(value) ? value : [value];
  return locations.flatMap((item) => {
    const location = toCodeLocation(item);
    return location ? [location] : [];
  });
}

function toCodeLocation(item: Location | LocationLink): CodeLocation | null {
  const loc = item as Record<string, unknown>;
  const uri = loc.uri ?? loc.targetUri;
  if (typeof uri !== "string") return null;

  // Prefer targetSelectionRange > targetRange > range
  const range = loc.targetSelectionRange ?? loc.targetRange ?? loc.range;
  if (!range || typeof range !== "object") return null;

  const r = range as { start: Record<string, unknown>; end: Record<string, unknown> };
  const start = r.start;
  const end = r.end;
  if (!start || !end) return null;

  return {
    uri,
    range: {
      start: { line: (start.line as number) ?? 0, character: (start.character as number) ?? 0 },
      end: { line: (end.line as number) ?? 0, character: (end.character as number) ?? 0 },
    },
  };
}

const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

function symbolKindName(kind: number): string {
  return SYMBOL_KIND_NAMES[kind] ?? "Unknown";
}

function flattenDocumentSymbols(
  symbols: DocumentSymbol[] | SymbolInformation[],
  filePath: string,
  container: string | null,
  context: { sourceLines: readonly string[] | null; nesting: DeclarationNesting },
): DocumentCodeSymbol[] {
  const result: DocumentCodeSymbol[] = [];

  for (const sym of symbols) {
    // DocumentSymbol.range = full defining node (declaration anchor);
    // .selectionRange = identifier token (name anchor). SymbolInformation has
    // only location.range (declaration) and no selectionRange.
    let document: DocumentSymbol | null = null;
    let information: SymbolInformation | null = null;
    if (isSymbolInformation(sym)) information = sym;
    else document = sym;
    const declStart = document?.range.start ?? information?.location.range.start;
    if (!declStart) continue;
    const nameStart = document
      ? resolveDocumentSymbolNameStart(document, context.sourceLines)
      : null;
    const reportedContainer = information?.containerName ?? container;
    // SymbolInformation is flat: containerName remains metadata, not hierarchy evidence.
    const nesting: DeclarationNesting = information ? "unknown" : context.nesting;

    const symbol: DocumentCodeSymbol = {
      name: sym.name,
      kind: symbolKindName(sym.kind),
      file: filePath,
      declarationAnchor: { line: declStart.line + 1, character: declStart.character + 1 },
      container: reportedContainer,
      nesting,
    };
    if (nameStart) {
      symbol.nameAnchor = { line: nameStart.line + 1, character: nameStart.character + 1 };
    }

    result.push(symbol);

    if (document?.children && document.children.length > 0) {
      result.push(
        ...flattenDocumentSymbols(document.children, filePath, sym.name, {
          sourceLines: context.sourceLines,
          nesting: "nested",
        }),
      );
    }
  }

  return result;
}

function isSymbolInformation(
  symbol: DocumentSymbol | SymbolInformation,
): symbol is SymbolInformation {
  return "location" in symbol;
}

async function readSourceLines(filePath: string): Promise<readonly string[] | null> {
  try {
    return (await readFile(filePath, "utf-8")).split(/\r?\n/);
  } catch {
    return null;
  }
}

/**
 * Validate the LSP selection range against source text. Some servers return
 * the full overload declaration as selectionRange; recover the exact symbol
 * token on that line rather than labeling the declaration start as a name.
 */
function resolveDocumentSymbolNameStart(
  symbol: DocumentSymbol,
  sourceLines: readonly string[] | null,
): { line: number; character: number } | null {
  const selectionStart = symbol.selectionRange?.start;
  if (!selectionStart) return null;
  if (!sourceLines) return selectionStart;

  const sourceLine = sourceLines[selectionStart.line];
  if (sourceLine === undefined) return null;
  if (
    sourceLine.slice(selectionStart.character, selectionStart.character + symbol.name.length) ===
    symbol.name
  ) {
    return selectionStart;
  }

  const rangeStart = symbol.range?.start;
  const rangeEnd = symbol.range?.end;
  const from = rangeStart?.line === selectionStart.line ? rangeStart.character : 0;
  const until = rangeEnd?.line === selectionStart.line ? rangeEnd.character : sourceLine.length;
  const repairedCharacter = sourceLine.indexOf(symbol.name, from);
  if (repairedCharacter < 0 || repairedCharacter + symbol.name.length > until) return null;
  return { line: selectionStart.line, character: repairedCharacter };
}

function toCodeSymbol(sym: SymbolInformation): CodeSymbol {
  const uri = sym.location?.uri ?? "";
  const start = sym.location?.range?.start;
  return {
    name: sym.name,
    kind: symbolKindName(sym.kind),
    file: uriToFile(uri),
    // SymbolInformation has no selectionRange — nameAnchor is derived later
    // by the orchestration layer's refine, or left absent.
    declarationAnchor: {
      line: start ? start.line + 1 : 0,
      character: start ? start.character + 1 : 0,
    },
    container: sym.containerName ?? null,
  };
}

// ── Hover conversion helpers ─────────────────────────────────────────

/**
 * Convert an LSP Hover result into a simplified runtime shape.
 * Extracts text from MarkupContent, MarkedString[], or plain string,
 * and converts the optional LSP Range to a SourceRange.
 */
function convertLspHover(hover: Hover): { contents: string; range?: SourceRange } {
  const contents = extractHoverText(hover.contents);
  const result: { contents: string; range?: SourceRange } = { contents };
  if (hover.range) {
    result.range = {
      start: { line: hover.range.start.line, character: hover.range.start.character },
      end: { line: hover.range.end.line, character: hover.range.end.character },
    };
  }
  return result;
}

function extractHoverText(contents: Hover["contents"]): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((item) => {
        if (typeof item === "string") return item;
        return item.value;
      })
      .join("\n");
  }
  // MarkupContent
  return (contents as MarkupContent).value ?? "";
}
