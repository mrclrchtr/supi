// LSP semantic provider adapter — wraps SessionLspService into the shared
// SemanticProvider contract from supi-code-runtime.

import type {
  CodeLocation,
  CodePosition,
  CodeSymbol,
  SemanticProvider,
} from "@mrclrchtr/supi-code-runtime/api";
import type { DocumentSymbol, Location, LocationLink, SymbolInformation } from "../config/types.ts";
import type { SessionLspService } from "../session/service-registry.ts";

/**
 * Create a SemanticProvider backed by a SessionLspService.
 * Maps LSP types into the shared code-runtime types.
 */
export function createLspSemanticProvider(lsp: SessionLspService): SemanticProvider {
  return {
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
