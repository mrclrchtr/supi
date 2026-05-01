// LSP tool action implementations — dispatches agent tool calls to LSP clients.

import * as fs from "node:fs";
import * as path from "node:path";
import { formatDiagnostics } from "./diagnostics.ts";
import {
  formatCodeActions,
  formatDocumentSymbols,
  formatHover,
  formatLocations,
  formatSearchResults,
  formatSymbolInformation,
  formatWorkspaceEdit,
  formatWorkspaceSymbols,
  normalizeLocations,
} from "./format.ts";
import type { LspManager } from "./manager.ts";
import { fallbackGrep } from "./search-fallback.ts";
import type { DocumentSymbol, Range, SymbolInformation } from "./types.ts";
import { uriToFile } from "./utils.ts";

// ── Types ─────────────────────────────────────────────────────────────

export type LspAction =
  | "hover"
  | "definition"
  | "references"
  | "diagnostics"
  | "symbols"
  | "rename"
  | "code_actions"
  | "workspace_symbol"
  | "search"
  | "symbol_hover";

export interface LspToolParams {
  action: LspAction;
  file?: string;
  line?: number;
  character?: number;
  newName?: string;
  query?: string;
  symbol?: string;
}

// ── Tool Description ──────────────────────────────────────────────────

export const lspToolDescription = `Language Server Protocol tool — provides type-aware code intelligence.

Actions:
- hover: Get type info and docs at a position. Params: file, line, character
- definition: Go to definition of a symbol. Params: file, line, character
- references: Find all references to a symbol. Params: file, line, character
- diagnostics: Get type errors and warnings. Params: file (optional — omit for all files)
- symbols: List all symbols in a file. Params: file
- rename: Rename a symbol across the project. Params: file, line, character, newName
- code_actions: Get available fixes/refactors at a position. Params: file, line, character
- workspace_symbol: Fuzzy symbol search across the project. Params: query
- search: Search for symbols (LSP first, then text fallback). Params: query
- symbol_hover: Hover info by symbol name (zero coordinates). Params: symbol

Line and character are 1-based. File paths are relative to cwd.`;

// ── Action Dispatcher ─────────────────────────────────────────────────

export async function executeAction(manager: LspManager, params: LspToolParams): Promise<string> {
  const cwd = manager.getCwd();
  switch (params.action) {
    case "hover":
      return handleHover(manager, params);
    case "definition":
      return handleDefinition(manager, params, cwd);
    case "references":
      return handleReferences(manager, params, cwd);
    case "diagnostics":
      return handleDiagnostics(manager, params, cwd);
    case "symbols":
      return handleSymbols(manager, params, cwd);
    case "rename":
      return handleRename(manager, params, cwd);
    case "code_actions":
      return handleCodeActions(manager, params);
    case "workspace_symbol":
      return handleWorkspaceSymbol(manager, params, cwd);
    case "search":
      return handleSearch(manager, params, cwd);
    case "symbol_hover":
      return handleSymbolHover(manager, params);
    default:
      return `Unknown action: ${params.action}`;
  }
}

// ── Action Handlers ───────────────────────────────────────────────────

async function handleHover(manager: LspManager, params: LspToolParams): Promise<string> {
  const { file, line, character } = requireFilePosition(params);
  const client = await manager.ensureFileOpen(file);
  if (!client) return noServerMessage(file);

  const hover = await client.hover(path.resolve(file), toZeroBased(line, character));
  if (!hover) return "No hover information available at this position.";
  return formatHover(hover);
}

async function handleDefinition(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  const { file, line, character } = requireFilePosition(params);
  const client = await manager.ensureFileOpen(file);
  if (!client) return noServerMessage(file);

  const result = await client.definition(path.resolve(file), toZeroBased(line, character));
  if (!result) return "No definition found.";

  const locations = normalizeLocations(result);
  if (locations.length === 0) return "No definition found.";

  return formatLocations("Definition", locations, cwd);
}

async function handleReferences(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  const { file, line, character } = requireFilePosition(params);
  const client = await manager.ensureFileOpen(file);
  if (!client) return noServerMessage(file);

  const locations = await client.references(path.resolve(file), toZeroBased(line, character));
  if (!locations || locations.length === 0) return "No references found.";

  return formatLocations("References", locations, cwd);
}

async function handleDiagnostics(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  if (params.file) {
    const resolvedPath = path.resolve(params.file);
    const client = await manager.ensureFileOpen(params.file);
    if (!client) return noServerMessage(params.file);

    let content: string;
    try {
      content = fs.readFileSync(resolvedPath, "utf-8");
    } catch {
      return `Error: cannot read file ${params.file}`;
    }

    const diags = await client.syncAndWaitForDiagnostics(resolvedPath, content);
    return formatDiagnostics(params.file, diags, cwd);
  }

  const summary = manager.getDiagnosticSummary();
  if (summary.length === 0) return "No diagnostics across any files.";

  const lines = ["## Diagnostics Summary\n"];
  for (const s of summary) {
    lines.push(`- **${s.file}**: ${s.errors} error(s), ${s.warnings} warning(s)`);
  }
  return lines.join("\n");
}

async function handleSymbols(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  if (!params.file) return "Error: 'file' parameter is required for symbols action.";

  const client = await manager.ensureFileOpen(params.file);
  if (!client) return noServerMessage(params.file);

  const symbols = await client.documentSymbols(path.resolve(params.file));
  if (!symbols || symbols.length === 0) return "No symbols found.";

  if ("children" in symbols[0] || "selectionRange" in symbols[0]) {
    return formatDocumentSymbols(symbols as DocumentSymbol[], 0);
  }
  return formatSymbolInformation(symbols as SymbolInformation[], cwd);
}

async function handleRename(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  const { file, line, character } = requireFilePosition(params);
  if (!params.newName) return "Error: 'newName' parameter is required for rename action.";

  const client = await manager.ensureFileOpen(file);
  if (!client) return noServerMessage(file);

  const edit = await client.rename(
    path.resolve(file),
    toZeroBased(line, character),
    params.newName,
  );
  if (!edit) return "Rename not available at this position.";

  return formatWorkspaceEdit(edit, cwd);
}

async function handleCodeActions(manager: LspManager, params: LspToolParams): Promise<string> {
  const { file, line, character } = requireFilePosition(params);
  const client = await manager.ensureFileOpen(file);
  if (!client) return noServerMessage(file);

  const pos = toZeroBased(line, character);
  const range: Range = { start: pos, end: pos };
  const diags = client.getDiagnostics(path.resolve(file));

  const relevantDiags = diags.filter(
    (d) => d.range.start.line <= pos.line && d.range.end.line >= pos.line,
  );

  const actions = await client.codeActions(path.resolve(file), range, {
    diagnostics: relevantDiags,
  });
  if (!actions || actions.length === 0) return "No code actions available at this position.";

  return formatCodeActions(actions);
}

async function handleWorkspaceSymbol(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  if (!params.query || params.query.trim().length === 0) {
    return "Error: 'query' parameter is required for workspace_symbol action.";
  }
  const symbols = await manager.workspaceSymbol(params.query);
  if (!symbols) return "Workspace symbol search not supported by this language server.";
  if (symbols.length === 0) return `No symbols found for query "${params.query}".`;

  return formatWorkspaceSymbols(symbols as SymbolInformation[], cwd);
}

async function handleSearch(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  if (!params.query || params.query.trim().length === 0) {
    return "Error: 'query' parameter is required for search action.";
  }
  const symbols = await manager.workspaceSymbol(params.query);
  if (symbols && symbols.length > 0) {
    return formatWorkspaceSymbols(symbols as SymbolInformation[], cwd);
  }
  const grepMatches = fallbackGrep(cwd, params.query);
  return formatSearchResults(null, grepMatches, cwd);
}

async function handleSymbolHover(manager: LspManager, params: LspToolParams): Promise<string> {
  if (!params.symbol || params.symbol.trim().length === 0) {
    return "Error: 'symbol' parameter is required for symbol_hover action.";
  }
  const symbols = await manager.workspaceSymbol(params.symbol);
  if (!symbols || symbols.length === 0) {
    return `Symbol "${params.symbol}" not found.`;
  }

  const match = symbols[0];
  const filePath = uriToFile(match.location.uri);
  const client = await manager.ensureFileOpen(filePath);
  if (!client) return noServerMessage(filePath);

  const hover = await client.hover(filePath, match.location.range.start);
  if (!hover) return `No hover information available for "${params.symbol}".`;

  let result = formatHover(hover);
  if (symbols.length > 1) {
    result += `\n\n(${symbols.length - 1} other match${symbols.length === 2 ? "" : "es"} found — use workspace_symbol or search to disambiguate)`;
  }
  return result;
}

// ── Utility ───────────────────────────────────────────────────────────

function requireFilePosition(params: LspToolParams): {
  file: string;
  line: number;
  character: number;
} {
  if (!params.file) throw new Error("'file' parameter is required.");
  if (params.line === undefined) throw new Error("'line' parameter is required.");
  if (params.character === undefined) throw new Error("'character' parameter is required.");
  return { file: params.file, line: params.line, character: params.character };
}

function toZeroBased(line: number, character: number): { line: number; character: number } {
  return { line: line - 1, character: character - 1 };
}

function noServerMessage(file: string): string {
  return `No LSP server available for this file type (${path.extname(file) || "unknown"})`;
}
