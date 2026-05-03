// LSP result formatting — converts LSP response types into readable text.

import * as path from "node:path";
import type { GrepMatch } from "./search-fallback.ts";
import { isProjectSource } from "./summary.ts";
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

function formatLocationLine(loc: Location, cwd: string): string {
  const file = relPath(uriToFile(loc.uri), cwd);
  const line = loc.range.start.line + 1;
  const col = loc.range.start.character + 1;
  return `${file}:${line}:${col}`;
}

function formatLocationList(label: string, locs: Location[], cwd: string): string {
  const lines = [`${label} (${locs.length} locations):\n`];
  for (const loc of locs) {
    lines.push(`- ${formatLocationLine(loc, cwd)}`);
  }
  return lines.join("\n");
}

function formatExternalFallback(label: string, locs: Location[], cwd: string): string {
  const maxShown = 3;
  const shown = locs.slice(0, maxShown);
  const hidden = locs.length - maxShown;

  let result: string;
  if (shown.length === 1) {
    result = `${label}: ${formatLocationLine(shown[0], cwd)}`;
  } else {
    const lines = [`${label} (${locs.length} locations):\n`];
    for (const loc of shown) {
      lines.push(`- ${formatLocationLine(loc, cwd)}`);
    }
    result = lines.join("\n");
  }

  if (hidden > 0) {
    result += `\n+${hidden} more external ${hidden === 1 ? "location" : "locations"}`;
  }

  return result;
}

function formatExternalSuffix(count: number): string {
  return count === 1
    ? "+1 external location (node_modules, .pnpm, or out-of-tree)"
    : `+${count} external locations (node_modules, .pnpm, or out-of-tree)`;
}

export function formatLocations(label: string, locations: Location[], cwd: string): string {
  const projectLocs: Location[] = [];
  const externalLocs: Location[] = [];
  for (const loc of locations) {
    if (isProjectSource(uriToFile(loc.uri), cwd)) {
      projectLocs.push(loc);
    } else {
      externalLocs.push(loc);
    }
  }

  let result: string;

  if (projectLocs.length === 1) {
    result = `${label}: ${formatLocationLine(projectLocs[0], cwd)}`;
  } else if (projectLocs.length > 1) {
    result = formatLocationList(label, projectLocs, cwd);
  } else if (externalLocs.length > 0) {
    return formatExternalFallback(label, externalLocs, cwd);
  } else {
    return `${label}: No locations found.`;
  }

  if (externalLocs.length > 0) {
    result += `\n${formatExternalSuffix(externalLocs.length)}`;
  }

  return result;
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

export function formatSymbolInformation(symbols: SymbolInformation[], cwd: string): string {
  const projectSyms: SymbolInformation[] = [];
  const externalSyms: SymbolInformation[] = [];
  for (const sym of symbols) {
    if (isProjectSource(uriToFile(sym.location.uri), cwd)) {
      projectSyms.push(sym);
    } else {
      externalSyms.push(sym);
    }
  }

  const lines: string[] = [];
  const symbolsToShow = projectSyms.length > 0 ? projectSyms : externalSyms;
  for (const sym of symbolsToShow) {
    const kind = symbolKindName(sym.kind);
    const file = relPath(uriToFile(sym.location.uri), cwd);
    const line = sym.location.range.start.line + 1;
    const container = sym.containerName ? ` (in ${sym.containerName})` : "";
    lines.push(`- ${kind} **${sym.name}**${container} — ${file}:${line}`);
  }

  if (projectSyms.length > 0 && externalSyms.length > 0) {
    const suffix =
      externalSyms.length === 1
        ? "+1 external symbol (node_modules, .pnpm, or out-of-tree)"
        : `+${externalSyms.length} external symbols (node_modules, .pnpm, or out-of-tree)`;
    lines.push(`- _${suffix}_`);
  }

  return lines.join("\n");
}

// ── Workspace Edits ───────────────────────────────────────────────────

interface EditEntry {
  file: string;
  edits: Array<{ range: { start: { line: number } }; newText: string }>;
}

function partitionWorkspaceEdit(
  edit: WorkspaceEdit,
  cwd: string,
): { projectChanges: EditEntry[]; externalCount: number } {
  const projectChanges: EditEntry[] = [];
  let externalCount = 0;

  if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      const filePath = uriToFile(uri);
      if (isProjectSource(filePath, cwd)) {
        projectChanges.push({ file: relPath(filePath, cwd), edits });
      } else {
        externalCount++;
      }
    }
  }

  if (edit.documentChanges) {
    for (const dc of edit.documentChanges) {
      const filePath = uriToFile(dc.textDocument.uri);
      if (isProjectSource(filePath, cwd)) {
        projectChanges.push({ file: relPath(filePath, cwd), edits: dc.edits });
      } else {
        externalCount++;
      }
    }
  }

  return { projectChanges, externalCount };
}

export function formatWorkspaceEdit(edit: WorkspaceEdit, cwd: string): string {
  const { projectChanges, externalCount } = partitionWorkspaceEdit(edit, cwd);

  const lines: string[] = ["Rename workspace edit:\n"];
  for (const { file, edits } of projectChanges) {
    lines.push(`**${file}** (${edits.length} change(s))`);
    for (const e of edits) {
      const line = e.range.start.line + 1;
      lines.push(`  Line ${line}: → "${e.newText}"`);
    }
  }

  if (externalCount > 0) {
    const suffix =
      externalCount === 1
        ? "+1 external file (node_modules, .pnpm, or out-of-tree)"
        : `+${externalCount} external files (node_modules, .pnpm, or out-of-tree)`;
    lines.push(`\n_${suffix}_`);
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

// ── Workspace Symbols ─────────────────────────────────────────────────

export function formatWorkspaceSymbols(symbols: SymbolInformation[], cwd: string): string {
  if (symbols.length === 0) return "No symbols found.";

  const projectSyms: SymbolInformation[] = [];
  const externalSyms: SymbolInformation[] = [];
  for (const sym of symbols) {
    if (isProjectSource(uriToFile(sym.location.uri), cwd)) {
      projectSyms.push(sym);
    } else {
      externalSyms.push(sym);
    }
  }

  if (projectSyms.length === 0 && externalSyms.length > 0) {
    return `Workspace symbols: No in-project symbols found.\n+${externalSyms.length} external symbol${externalSyms.length === 1 ? "" : "s"} (node_modules, .pnpm, or out-of-tree).`;
  }

  const lines = [`Workspace symbols (${projectSyms.length}):\n`];
  for (const sym of projectSyms) {
    const kind = symbolKindName(sym.kind);
    const file = relPath(uriToFile(sym.location.uri), cwd);
    const line = sym.location.range.start.line + 1;
    const col = sym.location.range.start.character + 1;
    const container = sym.containerName ? ` — ${sym.containerName}` : "";
    lines.push(`- **${sym.name}** (${kind})${container} — ${file}:${line}:${col}`);
  }

  if (externalSyms.length > 0) {
    const suffix =
      externalSyms.length === 1
        ? "+1 external symbol (node_modules, .pnpm, or out-of-tree)"
        : `+${externalSyms.length} external symbols (node_modules, .pnpm, or out-of-tree)`;
    lines.push(`\n_${suffix}_`);
  }

  return lines.join("\n");
}

// ── Search Results ────────────────────────────────────────────────────

export function formatSearchResults(
  lspSymbols: SymbolInformation[] | null,
  grepMatches: GrepMatch[] | null,
  cwd: string,
): string {
  if (lspSymbols && lspSymbols.length > 0) {
    return formatWorkspaceSymbols(lspSymbols, cwd);
  }
  if (grepMatches && grepMatches.length > 0) {
    const lines = [`Text search results (${grepMatches.length}):\n`];
    for (const match of grepMatches) {
      lines.push(`- ${match.file}:${match.line}: ${match.text}`);
    }
    return lines.join("\n");
  }
  return "No symbols or text matches found.";
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

function relPath(filePath: string, cwd: string): string {
  return path.relative(cwd, filePath);
}
