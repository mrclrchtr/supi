import { readFile } from "node:fs/promises";
import type {
  CodeLocation,
  CodeSymbol,
  DeclarationNesting,
  DocumentCodeSymbol,
  SourceRange,
} from "@mrclrchtr/supi-code-runtime/api";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import type {
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkupContent,
  SymbolInformation,
} from "../config/types.ts";

/** Map one LSP location result to shared code locations. */
export function mapLocations(value: Location | Location[] | LocationLink[] | null): CodeLocation[] {
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
  const range = toValidRange(loc.targetSelectionRange ?? loc.targetRange ?? loc.range);
  return range ? { uri, range } : null;
}

function toValidRange(value: unknown): SourceRange | null {
  if (!value || typeof value !== "object") return null;
  const range = value as { start?: unknown; end?: unknown };
  const start = toValidPosition(range.start);
  const end = toValidPosition(range.end);
  return start && end && !isPositionBefore(end, start) ? { start, end } : null;
}

function toValidPosition(value: unknown): { line: number; character: number } | null {
  if (!value || typeof value !== "object") return null;
  const position = value as Record<string, unknown>;
  return Number.isInteger(position.line) &&
    (position.line as number) >= 0 &&
    Number.isInteger(position.character) &&
    (position.character as number) >= 0
    ? { line: position.line as number, character: position.character as number }
    : null;
}

function isPositionBefore(
  left: { line: number; character: number },
  right: { line: number; character: number },
): boolean {
  return left.line < right.line || (left.line === right.line && left.character < right.character);
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

/** Flatten provider symbols while preserving declaration and name anchors. */
export async function mapDocumentSymbols(
  symbols: DocumentSymbol[] | SymbolInformation[],
  filePath: string,
): Promise<DocumentCodeSymbol[]> {
  return flattenDocumentSymbols(symbols, filePath, null, {
    sourceLines: await readSourceLines(filePath),
    nesting: "top-level",
  });
}

function flattenDocumentSymbols(
  symbols: DocumentSymbol[] | SymbolInformation[],
  filePath: string,
  container: string | null,
  context: { sourceLines: readonly string[] | null; nesting: DeclarationNesting },
): DocumentCodeSymbol[] {
  const result: DocumentCodeSymbol[] = [];
  for (const sym of symbols) {
    let information: SymbolInformation | null = null;
    let document: DocumentSymbol | null = null;
    if (isSymbolInformation(sym)) information = sym;
    else document = sym;
    const declarationRange = toValidRange(document?.range ?? information?.location.range);
    if (!declarationRange) {
      if (document?.children?.length) {
        result.push(
          ...flattenDocumentSymbols(document.children, filePath, sym.name, {
            sourceLines: context.sourceLines,
            nesting: "nested",
          }),
        );
      }
      continue;
    }
    const declStart = declarationRange.start;
    const nameStart = document
      ? resolveDocumentSymbolNameStart(document, context.sourceLines)
      : null;
    const symbol: DocumentCodeSymbol = {
      name: sym.name,
      kind: symbolKindName(sym.kind),
      file: filePath,
      declarationAnchor: { line: declStart.line + 1, character: declStart.character + 1 },
      container: information?.containerName ?? container,
      nesting: information ? "unknown" : context.nesting,
    };
    if (nameStart) {
      symbol.nameAnchor = { line: nameStart.line + 1, character: nameStart.character + 1 };
    }
    result.push(symbol);
    if (document?.children?.length) {
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

function resolveDocumentSymbolNameStart(
  symbol: DocumentSymbol,
  sourceLines: readonly string[] | null,
): { line: number; character: number } | null {
  const selectionRange = toValidRange(symbol.selectionRange);
  if (!selectionRange) return null;
  const selectionStart = selectionRange.start;
  if (!sourceLines) return selectionStart;
  const sourceLine = sourceLines[selectionStart.line];
  if (sourceLine === undefined) return null;
  if (
    sourceLine.slice(selectionStart.character, selectionStart.character + symbol.name.length) ===
    symbol.name
  ) {
    return selectionStart;
  }
  const declarationRange = toValidRange(symbol.range);
  if (!declarationRange) return null;
  const from =
    declarationRange.start.line === selectionStart.line ? declarationRange.start.character : 0;
  const until =
    declarationRange.end.line === selectionStart.line
      ? declarationRange.end.character
      : sourceLine.length;
  const character = sourceLine.indexOf(symbol.name, from);
  if (character < 0 || character + symbol.name.length > until) return null;
  return { line: selectionStart.line, character };
}

/** Map one valid workspace symbol to the shared representation. */
export function toCodeSymbol(sym: SymbolInformation): CodeSymbol | null {
  const location = toCodeLocation(sym.location);
  if (!location) return null;
  return {
    name: sym.name,
    kind: symbolKindName(sym.kind),
    file: uriToFile(location.uri),
    declarationAnchor: {
      line: location.range.start.line + 1,
      character: location.range.start.character + 1,
    },
    container: sym.containerName ?? null,
  };
}

/** Convert an LSP hover response to the shared representation. */
export function convertLspHover(hover: Hover): { contents: string; range?: SourceRange } {
  const result: { contents: string; range?: SourceRange } = {
    contents: extractHoverText(hover.contents),
  };
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
    return contents.map((item) => (typeof item === "string" ? item : item.value)).join("\n");
  }
  return (contents as MarkupContent).value ?? "";
}
