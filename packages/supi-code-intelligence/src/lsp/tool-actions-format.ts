// Formatting utilities for LSP tool actions.
// Extracted from tool-actions.ts to keep file sizes within Biome limits.

import * as path from "node:path";

// ── Formatting helpers ────────────────────────────────────────────────

export function formatError(label: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `${label}: ${message}`;
}

function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  return decodeURIComponent(uri.slice(7));
}

// ── Formatters ────────────────────────────────────────────────────────

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
  return SYMBOL_KIND_NAMES[kind] ?? `kind ${kind}`;
}

export function formatHover(result: { contents: unknown; range?: unknown }): string {
  const lines: string[] = [];
  const contents = result.contents;
  if (typeof contents === "string") {
    lines.push(contents);
  } else if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === "string") lines.push(item);
      else if (item && typeof item === "object" && "value" in item) {
        lines.push(String((item as { value: string }).value));
      }
    }
  } else if (contents && typeof contents === "object" && "value" in contents) {
    lines.push(String((contents as { value: string }).value));
  }
  if (result.range) lines.push(`Range: ${JSON.stringify(result.range)}`);
  return lines.join("\n") || "No hover content.";
}

export function formatLocations(result: unknown): string {
  const list: Array<Record<string, unknown>> = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : result
      ? [result as Record<string, unknown>]
      : [];
  return list
    .map((loc) => {
      const uri = (loc.uri ?? loc.targetUri) as string | undefined;
      const range =
        (loc.targetSelectionRange as Record<string, unknown> | undefined) ??
        (loc.targetRange as Record<string, unknown> | undefined) ??
        (loc.range as Record<string, unknown> | undefined);
      const r = range as { start?: { line?: number }; end?: { line?: number } } | undefined;
      if (uri && r?.start) {
        const file = uriToPath(uri);
        const startLine = (r.start.line ?? 0) + 1;
        const endLine = (r.end?.line ?? startLine) + 1;
        return `${file}:${startLine}:${endLine}`;
      }
      return uri ? uriToPath(uri) : "unknown location";
    })
    .join("\n");
}

export function formatSymbols(
  symbols: Array<{
    name: string;
    kind?: number;
    selectionRange?: { start: { line: number } };
    children?: Array<Record<string, unknown>>;
  }>,
  indent: number = 0,
): string {
  const prefix = "  ".repeat(indent);
  const lines: string[] = [];
  for (const sym of symbols) {
    const line =
      sym.selectionRange?.start?.line != null ? `:${sym.selectionRange.start.line + 1}` : "";
    const kind = sym.kind != null ? ` (${symbolKindName(sym.kind)})` : "";
    lines.push(`${prefix}${sym.name}${kind}${line}`);
    if (Array.isArray(sym.children) && sym.children.length > 0) {
      lines.push(formatSymbols(sym.children as typeof symbols, indent + 1));
    }
  }
  return lines.join("\n");
}

export function formatSymbolInformation(
  symbols: Array<{
    name: string;
    kind?: number;
    containerName?: string | null;
    location?: { uri: string; range?: { start: { line: number } } } | null;
  }>,
  cwd: string,
): string {
  return symbols
    .map((sym) => {
      const container = sym.containerName ? ` in ${sym.containerName}` : "";
      const loc = sym.location?.uri
        ? ` — ${path.relative(cwd, uriToPath(sym.location.uri))}${
            sym.location.range?.start?.line != null ? `:${sym.location.range.start.line + 1}` : ""
          }`
        : "";
      return `${sym.name}${container}${loc}`;
    })
    .join("\n");
}

export function formatDiagnostics(
  diagnostics: Array<{ severity?: number; message: string; range: { start: { line: number } } }>,
): string {
  return diagnostics
    .map((d) => {
      const sev = d.severity != null ? `[sev=${d.severity}] ` : "";
      return `Line ${d.range.start.line + 1}: ${sev}${d.message}`;
    })
    .join("\n");
}

export function formatWorkspaceDiagnosticSummary(
  summary: Array<{ file: string; errors: number; warnings: number }>,
): string {
  const lines = summary.map(
    (entry) => `${entry.file}: ${entry.errors} error(s), ${entry.warnings} warning(s)`,
  );
  return lines.join("\n");
}

export function formatRename(edit: {
  changes?: Record<string, Array<{ newText: string; range: { start: { line: number } } }>>;
}): string {
  if (!edit.changes) return "No rename changes.";
  const lines: string[] = [];
  for (const [uri, changes] of Object.entries(edit.changes)) {
    const file = uriToPath(uri);
    lines.push(`${file}:`);
    for (const change of changes) {
      lines.push(`  L${change.range.start.line + 1}: → ${change.newText}`);
    }
  }
  return lines.join("\n");
}

export function formatCodeActions(
  actions: Array<{
    title: string;
    kind?: string;
    diagnostics?: Array<{ message: string }>;
  }>,
): string {
  return actions
    .map((action) => {
      const kind = action.kind ? ` [${action.kind}]` : "";
      const diag =
        action.diagnostics && action.diagnostics.length > 0
          ? ` — fixes: ${action.diagnostics.map((d) => d.message).join("; ")}`
          : "";
      return `${action.title}${kind}${diag}`;
    })
    .join("\n");
}
