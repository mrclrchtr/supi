// LSP result formatting — converts LSP response types into readable text.

import * as path from "node:path";
import type {
  CodeAction,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  MarkedString,
  MarkupContent,
  SymbolInformation,
  WorkspaceEdit,
} from "./types.ts";
import { uriToFile } from "./utils.ts";

// ── Hover ─────────────────────────────────────────────────────────────

export function formatHover(hover: Hover): string {
  const contents = hover.contents;

  if (typeof contents === "string") return contents;
  if ("value" in contents) {
    const mc = contents as MarkupContent | { language: string; value: string };
    if ("kind" in mc) return mc.value;
    return `\`\`\`${mc.language}\n${mc.value}\n\`\`\``;
  }
  if (Array.isArray(contents)) {
    return (contents as MarkedString[])
      .map((c) => (typeof c === "string" ? c : `\`\`\`${c.language}\n${c.value}\n\`\`\``))
      .join("\n\n");
  }

  return String(contents);
}

// ── Locations ─────────────────────────────────────────────────────────

export function formatLocations(label: string, locations: Location[]): string {
  if (locations.length === 1) {
    const loc = locations[0];
    const file = relPath(uriToFile(loc.uri));
    const line = loc.range.start.line + 1;
    const col = loc.range.start.character + 1;
    return `${label}: ${file}:${line}:${col}`;
  }

  const lines = [`${label} (${locations.length} locations):\n`];
  for (const loc of locations) {
    const file = relPath(uriToFile(loc.uri));
    const line = loc.range.start.line + 1;
    const col = loc.range.start.character + 1;
    lines.push(`- ${file}:${line}:${col}`);
  }
  return lines.join("\n");
}

export function normalizeLocations(result: Location | Location[] | LocationLink[]): Location[] {
  if (Array.isArray(result)) {
    return result.map((item) => {
      if ("targetUri" in item) {
        const link = item as LocationLink;
        return { uri: link.targetUri, range: link.targetSelectionRange };
      }
      return item as Location;
    });
  }
  return [result as Location];
}

// ── Symbols ───────────────────────────────────────────────────────────

export function formatDocumentSymbols(symbols: DocumentSymbol[], indent: number): string {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  for (const sym of symbols) {
    const kind = symbolKindName(sym.kind);
    const line = sym.selectionRange.start.line + 1;
    const detail = sym.detail ? ` — ${sym.detail}` : "";
    lines.push(`${prefix}- ${kind} **${sym.name}**${detail} (line ${line})`);

    if (sym.children && sym.children.length > 0) {
      lines.push(formatDocumentSymbols(sym.children, indent + 1));
    }
  }

  return lines.join("\n");
}

export function formatSymbolInformation(symbols: SymbolInformation[]): string {
  const lines: string[] = [];
  for (const sym of symbols) {
    const kind = symbolKindName(sym.kind);
    const file = relPath(uriToFile(sym.location.uri));
    const line = sym.location.range.start.line + 1;
    const container = sym.containerName ? ` (in ${sym.containerName})` : "";
    lines.push(`- ${kind} **${sym.name}**${container} — ${file}:${line}`);
  }
  return lines.join("\n");
}

// ── Workspace Edits ───────────────────────────────────────────────────

export function formatWorkspaceEdit(edit: WorkspaceEdit): string {
  const lines: string[] = ["Rename workspace edit:\n"];

  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      const file = relPath(uriToFile(uri));
      lines.push(`**${file}** (${edits.length} change(s))`);
      for (const e of edits) {
        const line = e.range.start.line + 1;
        lines.push(`  Line ${line}: → "${e.newText}"`);
      }
    }
  }

  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      const file = relPath(uriToFile(dc.textDocument.uri));
      lines.push(`**${file}** (${dc.edits.length} change(s))`);
      for (const e of dc.edits) {
        const line = e.range.start.line + 1;
        lines.push(`  Line ${line}: → "${e.newText}"`);
      }
    }
  }

  return lines.join("\n");
}

// ── Code Actions ──────────────────────────────────────────────────────

export function formatCodeActions(actions: CodeAction[]): string {
  const lines = [`Available code actions (${actions.length}):\n`];
  for (const action of actions) {
    const kind = action.kind ? ` [${action.kind}]` : "";
    const preferred = action.isPreferred ? " ⭐" : "";
    lines.push(`- **${action.title}**${kind}${preferred}`);
    if (action.edit) {
      const fileCount = action.edit.changes
        ? Object.keys(action.edit.changes).length
        : (action.edit.documentChanges?.length ?? 0);
      lines.push(`  Edits ${fileCount} file(s)`);
    }
  }
  return lines.join("\n");
}

// ── Symbol Kind Names ─────────────────────────────────────────────────

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
  return SYMBOL_KIND_NAMES[kind] ?? `Kind(${kind})`;
}

// ── Helpers ───────────────────────────────────────────────────────────

function relPath(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}
