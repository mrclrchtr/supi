// LSP semantic provider adapter — wraps SessionLspService into the shared
// SemanticProvider contract from supi-code-runtime.

import {
  type CodeLocation,
  type CodePosition,
  type CodeSymbol,
  normalizeRefactorOperation,
  type RefactorRequest,
  type RefactorResult,
  type SemanticProvider,
  type SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkupContent,
  SymbolInformation,
} from "../config/types.ts";
import type { SessionLspService } from "../session/service-registry.ts";
import {
  collectCodeActionResults,
  isDeleteDeadCodeCodeAction,
  isUpdateImportsCodeAction,
  runFilteredCodeActionRefactor,
  runRenameRefactor,
} from "./refactor-planning.ts";

/**
 * Create a SemanticProvider backed by a SessionLspService.
 * Maps LSP types into the shared code-runtime types.
 */
export function createLspSemanticProvider(lsp: SessionLspService): SemanticProvider {
  return {
    async definition(filePath: string, position: CodePosition): Promise<CodeLocation[] | null> {
      const result = await lsp.definition(filePath, position);
      if (!result) return null;
      const normalized = Array.isArray(result) ? result : [result];
      const mapped: CodeLocation[] = [];
      for (const item of normalized) {
        const loc = toCodeLocation(item);
        if (loc) mapped.push(loc);
      }
      return mapped;
    },

    async hover(
      filePath: string,
      position: CodePosition,
    ): Promise<{ contents: string; range?: SourceRange } | null> {
      const result = await lsp.hover(filePath, position);
      if (!result) return null;
      return convertLspHover(result);
    },

    async references(filePath: string, position: CodePosition): Promise<CodeLocation[] | null> {
      const refResult = await lsp.references(filePath, position);
      if (!refResult) return null;
      const mapped: CodeLocation[] = [];
      for (const item of refResult) {
        const loc = toCodeLocation(item);
        if (loc) mapped.push(loc);
      }
      return mapped;
    },

    async implementation(filePath: string, position: CodePosition): Promise<CodeLocation[] | null> {
      const implResult = await lsp.implementation(filePath, position);
      if (!implResult) return null;
      const normalized = Array.isArray(implResult) ? implResult : [implResult];
      const mapped: CodeLocation[] = [];
      for (const item of normalized) {
        const loc = toCodeLocation(item);
        if (loc) mapped.push(loc);
      }
      return mapped;
    },

    async documentSymbols(filePath: string): Promise<CodeSymbol[] | null> {
      const symbols = await lsp.documentSymbols(filePath);
      if (!symbols) return null;
      return flattenDocumentSymbols(symbols, filePath);
    },

    async workspaceSymbols(query: string): Promise<CodeSymbol[] | null> {
      const results = await lsp.workspaceSymbol(query);
      if (!results) return null;
      return results.map((sym) => toCodeSymbol(sym as SymbolInformation));
    },

    async refactor(request: RefactorRequest): Promise<RefactorResult> {
      // Normalize defensively at the provider boundary as well as in
      // code-intelligence. RefactorRequest still permits the legacy `rename`
      // alias, and the provider may be invoked directly outside the public tool.
      const operation = normalizeRefactorOperation(request.operation);

      switch (operation) {
        case "rename_symbol":
          if (!request.newName) {
            return {
              kind: "unavailable",
              reason: 'Refactor operation "rename_symbol" requires `newName`.',
            };
          }
          return runRenameRefactor(lsp, request.file, request.position, request.newName);
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
            reason: `Refactor operation "${operation}" is not supported yet. File/resource operations are deferred.`,
          };
      }

      return {
        kind: "unavailable",
        reason: `Refactor operation "${operation}" is not supported by the active semantic provider.`,
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

    async codeActionTitles(
      file: string,
      position: CodePosition,
    ): Promise<Array<{ title: string; kind?: string }> | null> {
      const actions = await lsp.codeActions(file, position);
      if (!actions) return null;
      return actions
        .filter((a) => a.title)
        .map((a) => ({ title: a.title, kind: a.kind ?? undefined }));
    },
  };
}

// ── Type conversion helpers ───────────────────────────────────────────

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
  container: string | null = null,
): CodeSymbol[] {
  const result: CodeSymbol[] = [];

  for (const sym of symbols) {
    // DocumentSymbol has selectionRange; SymbolInformation has location
    const ds = sym as DocumentSymbol;
    const si = sym as SymbolInformation;
    const start = ds.selectionRange?.start ?? si.location?.range?.start;
    if (!start) continue;

    result.push({
      name: sym.name,
      kind: symbolKindName(sym.kind),
      file: filePath,
      line: start.line + 1,
      character: start.character + 1,
      container,
    });

    if (Array.isArray(ds.children) && ds.children.length > 0) {
      result.push(...flattenDocumentSymbols(ds.children, filePath, sym.name));
    }
  }

  return result;
}

function toCodeSymbol(sym: SymbolInformation): CodeSymbol {
  const uri = sym.location?.uri ?? "";
  const start = sym.location?.range?.start;
  return {
    name: sym.name,
    kind: symbolKindName(sym.kind),
    file: uri.startsWith("file://") ? decodeURIComponent(uri.slice(7)) : uri,
    line: start ? start.line + 1 : 0,
    character: start ? start.character + 1 : 0,
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
