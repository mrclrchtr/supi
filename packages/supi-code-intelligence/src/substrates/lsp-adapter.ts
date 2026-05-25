// LSP semantic substrate adapter — wraps SessionLspService into SemanticSubstrate.

import type { CodeLocation, CodePosition } from "@mrclrchtr/supi-core/types";
import {
  getSessionLspService,
  type SessionLspService,
  waitForSessionLspService,
} from "@mrclrchtr/supi-lsp/api";
import type { CodeSymbol, SemanticSubstrate } from "./types.ts";

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

/**
 * Create a SemanticSubstrate backed by the session-scoped LSP service.
 *
 * The adapter handles service acquisition, readiness waiting, and
 * normalizes LSP types into CodeLocation / CodeSymbol.
 */
export function createSemanticSubstrate(cwd: string): SemanticSubstrate {
  return {
    references: async (filePath, position) =>
      withService(cwd, (lsp) =>
        lsp.references(filePath, position).then((locs) =>
          locs
            ? locs.map((l: { uri: string; range: { start: CodePosition; end: CodePosition } }) => ({
                uri: l.uri,
                range: l.range,
              }))
            : null,
        ),
      ),

    implementation: async (filePath, position) =>
      withService(cwd, async (lsp) => {
        const result = await lsp.implementation(filePath, position);
        if (!result) return null;
        const list: Array<Record<string, unknown>> = Array.isArray(result) ? result : [result];
        return list.map(toCodeLocation).filter(Boolean) as CodeLocation[];
      }),

    documentSymbols: async (filePath) =>
      withService(cwd, async (lsp) => {
        const symbols = await lsp.documentSymbols(filePath);
        if (!symbols) return null;
        return flattenDocumentSymbols(symbols, filePath);
      }),

    workspaceSymbols: async (query) =>
      withService(cwd, async (lsp) => {
        const results = await lsp.workspaceSymbol(query);
        if (!results) return null;
        return results.map(toCodeSymbol);
      }),
  };
}

// ── Acquisition ─────────────────────────────────────────────────────

async function acquire(cwd: string): Promise<SessionLspService | null> {
  const state = getSessionLspService(cwd);
  if (state.kind === "ready") return state.service;
  if (state.kind === "pending") {
    const waited = await waitForSessionLspService(cwd, 250);
    return waited.kind === "ready" ? waited.service : null;
  }
  return null;
}

async function withService<T>(
  cwd: string,
  fn: (lsp: SessionLspService) => Promise<T | null>,
): Promise<T | null> {
  const lsp = await acquire(cwd);
  if (!lsp) return null;
  return fn(lsp);
}

// ── Type mapping ────────────────────────────────────────────────────

function toCodeLocation(loc: Record<string, unknown>): CodeLocation | null {
  const uri = loc.uri ?? loc.targetUri;
  // LocationLink has targetSelectionRange (precise symbol span) and targetRange (full range).
  // Location has range only. Prefer the most precise: targetSelectionRange > targetRange > range.
  const range = loc.targetSelectionRange ?? loc.targetRange ?? loc.range;
  if (typeof uri !== "string") return null;
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

function flattenDocumentSymbols(
  symbols: Array<{
    name: string;
    kind: number;
    selectionRange?: { start: { line: number; character: number } };
    children?: Array<unknown>;
  }>,
  filePath: string,
  container: string | null = null,
): CodeSymbol[] {
  const result: CodeSymbol[] = [];

  for (const sym of symbols) {
    const start =
      sym.selectionRange?.start ??
      (sym as { location?: { range?: { start: { line: number; character: number } } } }).location
        ?.range?.start;
    if (!start) continue;

    result.push({
      name: sym.name,
      kind: symbolKindName(sym.kind),
      file: filePath,
      line: start.line + 1,
      character: start.character + 1,
      container,
    });

    if (Array.isArray(sym.children) && sym.children.length > 0) {
      result.push(
        ...flattenDocumentSymbols(
          sym.children as Array<{
            name: string;
            kind: number;
            selectionRange?: { start: { line: number; character: number } };
            children?: Array<unknown>;
          }>,
          filePath,
          sym.name,
        ),
      );
    }
  }

  return result;
}

function toCodeSymbol(sym: {
  name: string;
  kind: number;
  containerName?: string | null;
  location?: {
    uri: string;
    range?: { start: { line: number; character: number } };
  } | null;
}): CodeSymbol {
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
