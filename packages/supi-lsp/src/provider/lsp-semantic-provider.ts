// LSP semantic provider adapter — wraps SessionLspService into the shared
// SemanticProvider contract from supi-code-runtime.

import type {
  CodeLocation,
  CodePosition,
  CodeSymbol,
  RefactorResult,
  SemanticProvider,
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkupContent,
  SymbolInformation,
  TextDocumentEdit,
  TextEdit,
  WorkspaceEdit,
} from "../config/types.ts";
import type { SessionLspService } from "../session/service-registry.ts";

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

    async rename(file: string, position: CodePosition, newName: string): Promise<RefactorResult> {
      const edit = await lsp.rename(file, position, newName);
      return convertLspWorkspaceEdit(edit);
    },

    async codeActions(file: string, position: CodePosition): Promise<RefactorResult[]> {
      const actions = await lsp.codeActions(file, position);
      if (!actions) return [];

      const results: RefactorResult[] = [];
      for (const action of actions) {
        const edit = action.edit;
        if (!edit) {
          results.push({
            kind: "unavailable",
            reason: `Code action "${action.title}" has no edit`,
          });
          continue;
        }
        const converted = convertLspWorkspaceEdit(edit);
        if (converted.kind === "precise") {
          results.push(converted);
        } else {
          results.push({
            kind: "unavailable",
            reason: `Code action "${action.title}" could not produce precise edits`,
          });
        }
      }
      return results;
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

// ── LSP WorkspaceEdit converter ─────────────────────────────────────

/**
 * Convert an LSP WorkspaceEdit to the shared RefactorResult type.
 *
 * LSP WorkspaceEdit can use:
 * - `documentChanges` (preferred, with TextDocumentEdit)
 * - `changes` (legacy, URI → TextEdit[] map)
 *
 * Returns `unavailable` when both are missing or both produce zero edits.
 */
function resolveFileFromUri(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  try {
    return decodeURIComponent(uri.slice(7));
  } catch {
    return uri;
  }
}

function collectDocumentChangeEdits(
  docChanges: NonNullable<WorkspaceEdit["documentChanges"]>,
): Array<{
  file: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
}> {
  const out: Array<{
    file: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
  }> = [];
  for (const change of docChanges) {
    const tdEdit = change as TextDocumentEdit;
    if (!tdEdit.textDocument || !tdEdit.edits) continue;
    const file = resolveFileFromUri(tdEdit.textDocument.uri);
    for (const singleEdit of tdEdit.edits) {
      const te = singleEdit as TextEdit;
      out.push({
        file,
        range: {
          start: { line: te.range.start.line, character: te.range.start.character },
          end: { line: te.range.end.line, character: te.range.end.character },
        },
        newText: te.newText,
      });
    }
  }
  return out;
}

function collectChangesEdits(changes: NonNullable<WorkspaceEdit["changes"]>): Array<{
  file: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  newText: string;
}> {
  const out: Array<{
    file: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
  }> = [];
  for (const [uri, textEdits] of Object.entries(changes)) {
    if (!textEdits || textEdits.length === 0) continue;
    const file = resolveFileFromUri(uri);
    for (const te of textEdits) {
      out.push({
        file,
        range: {
          start: { line: te.range.start.line, character: te.range.start.character },
          end: { line: te.range.end.line, character: te.range.end.character },
        },
        newText: te.newText,
      });
    }
  }
  return out;
}

function convertLspWorkspaceEdit(edit: WorkspaceEdit | null): RefactorResult {
  if (!edit) {
    return { kind: "unavailable", reason: "LSP server returned no edit" };
  }

  let fileEdits = edit.documentChanges?.length
    ? collectDocumentChangeEdits(edit.documentChanges)
    : [];
  if (fileEdits.length === 0 && edit.changes) {
    fileEdits = collectChangesEdits(edit.changes);
  }

  if (fileEdits.length === 0) {
    return { kind: "unavailable", reason: "Workspace edit contains no file edits" };
  }

  return { kind: "precise", edits: { edits: fileEdits } };
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
