// LSP tool action implementations — dispatches agent tool calls to LSP clients.
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: action dispatch remains cohesive; recovery helpers stay adjacent for readability.

import * as fs from "node:fs";
import * as path from "node:path";
import type { LspClient } from "./client/client.ts";
import { formatDiagnostics } from "./diagnostics/diagnostics.ts";
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
import type { LspManager } from "./manager/manager.ts";
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
  | "symbol_hover"
  | "recover";

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
- recover: Refresh cached diagnostics after a workspace change. Params: none

Line and character are 1-based. File paths are relative to cwd.`;

// ── Action Dispatcher ─────────────────────────────────────────────────

export async function executeAction(manager: LspManager, params: LspToolParams): Promise<string> {
  const cwd = manager.getCwd();
  switch (params.action) {
    case "hover":
      return handleHover(manager, params, cwd);
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
      return handleCodeActions(manager, params, cwd);
    case "workspace_symbol":
      return handleWorkspaceSymbol(manager, params, cwd);
    case "search":
      return handleSearch(manager, params, cwd);
    case "symbol_hover":
      return handleSymbolHover(manager, params, cwd);
    case "recover":
      return handleRecover(manager);
    default:
      return `Unknown action: ${params.action}`;
  }
}

// ── Validation helpers ────────────────────────────────────────────────

function validateFilePosition(
  params: LspToolParams,
  action: string,
): { file: string; line: number; character: number } | string {
  if (!params.file) return `Validation error: 'file' is required for ${action} action.`;
  if (params.line === undefined)
    return `Validation error: 'line' is required for ${action} action.`;
  if (params.character === undefined)
    return `Validation error: 'character' is required for ${action} action.`;
  if (!Number.isInteger(params.line) || params.line < 1)
    return `Validation error: 'line' must be a positive 1-based integer for ${action} action.`;
  if (!Number.isInteger(params.character) || params.character < 1)
    return `Validation error: 'character' must be a positive 1-based integer for ${action} action.`;
  return { file: params.file, line: params.line, character: params.character };
}

function validateNonEmptyString(
  value: string | undefined,
  name: string,
  action: string,
): { value: string } | string {
  if (!value || value.trim().length === 0) {
    return `Validation error: '${name}' is required for ${action} action.`;
  }
  return { value };
}

function resolveFilePath(file: string, cwd: string): string {
  return path.resolve(cwd, file);
}

function toZeroBased(line: number, character: number): { line: number; character: number } {
  return { line: line - 1, character: character - 1 };
}

function noServerMessage(file: string): string {
  return `No LSP server available for this file type (${path.extname(file) || "unknown"})`;
}

// ── Higher-order helpers ──────────────────────────────────────────────

/**
 * Encapsulates the common preamble shared by file-position-based action handlers:
 * validates file/line/character, resolves the path, obtains the LSP client, and
 * returns an error string if any step fails. Passes the ready client and zero-based
 * coordinates to the callback.
 */
// biome-ignore lint/complexity/useMaxParams: Higher-order callback wrapper intentionally takes 5 params.
async function withFileClient(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
  action: string,
  fn: (client: LspClient, file: string, line: number, character: number) => Promise<string>,
): Promise<string> {
  const validation = validateFilePosition(params, action);
  if (typeof validation === "string") return validation;
  const { file, line, character } = validation;
  const resolvedPath = resolveFilePath(file, cwd);

  const client = await manager.ensureFileOpen(resolvedPath);
  if (!client) return noServerMessage(resolvedPath);

  return fn(client, resolvedPath, line, character);
}

// ── Action Handlers ───────────────────────────────────────────────────

async function handleHover(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  return withFileClient(manager, params, cwd, "hover", async (client, file, line, character) => {
    const hover = await client.hover(file, toZeroBased(line, character));
    if (!hover) return "No hover information available at this position.";
    return formatHover(hover);
  });
}

async function handleDefinition(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  return withFileClient(
    manager,
    params,
    cwd,
    "definition",
    async (client, file, line, character) => {
      const result = await client.definition(file, toZeroBased(line, character));
      if (!result) return "No definition found.";

      const locations = normalizeLocations(result);
      if (locations.length === 0) return "No definition found.";

      return formatLocations("Definition", locations, cwd);
    },
  );
}

async function handleReferences(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  return withFileClient(
    manager,
    params,
    cwd,
    "references",
    async (client, file, line, character) => {
      const locations = await client.references(file, toZeroBased(line, character));
      if (!locations || locations.length === 0) return "No references found.";

      return formatLocations("References", locations, cwd);
    },
  );
}

async function handleDiagnostics(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  if (params.file) {
    const resolvedPath = resolveFilePath(params.file, cwd);
    const client = await manager.ensureFileOpen(resolvedPath);
    if (!client) return noServerMessage(resolvedPath);

    let content: string;
    try {
      content = fs.readFileSync(resolvedPath, "utf-8");
    } catch {
      return `Error: cannot read file ${params.file}`;
    }

    const diags = await client.syncAndWaitForDiagnostics(resolvedPath, content);
    return formatDiagnostics(resolvedPath, diags, cwd);
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
  if (!params.file) return "Validation error: 'file' is required for symbols action.";
  const resolvedPath = resolveFilePath(params.file, cwd);

  const client = await manager.ensureFileOpen(resolvedPath);
  if (!client) return noServerMessage(resolvedPath);

  const symbols = await client.documentSymbols(resolvedPath);
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
  const nameValidation = validateNonEmptyString(params.newName, "newName", "rename");
  if (typeof nameValidation === "string") return nameValidation;
  const newName = nameValidation.value;

  return withFileClient(manager, params, cwd, "rename", async (client, file, line, character) => {
    const edit = await client.rename(file, toZeroBased(line, character), newName);
    if (!edit) return "Rename not available at this position.";

    return formatWorkspaceEdit(edit, cwd);
  });
}

async function handleCodeActions(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  return withFileClient(
    manager,
    params,
    cwd,
    "code_actions",
    async (client, file, line, character) => {
      const pos = toZeroBased(line, character);
      const range: Range = { start: pos, end: pos };
      const diags = client.getDiagnostics(file);

      const relevantDiags = diags.filter(
        (d) => d.range.start.line <= pos.line && d.range.end.line >= pos.line,
      );

      const actions = await client.codeActions(file, range, {
        diagnostics: relevantDiags,
      });
      if (!actions || actions.length === 0) return "No code actions available at this position.";

      return formatCodeActions(actions);
    },
  );
}

async function handleWorkspaceSymbol(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  const validation = validateNonEmptyString(params.query, "query", "workspace_symbol");
  if (typeof validation === "string") return validation;
  const query = validation.value;

  const symbols = await manager.workspaceSymbol(query);
  if (!symbols) return "Workspace symbol search not supported by this language server.";
  if (symbols.length === 0) return `No symbols found for query "${query}".`;

  return formatWorkspaceSymbols(symbols as SymbolInformation[], cwd);
}

async function handleSearch(
  manager: LspManager,
  params: LspToolParams,
  cwd: string,
): Promise<string> {
  const validation = validateNonEmptyString(params.query, "query", "search");
  if (typeof validation === "string") return validation;
  const query = validation.value;

  const symbols = await manager.workspaceSymbol(query);
  if (symbols && symbols.length > 0) {
    return formatWorkspaceSymbols(symbols as SymbolInformation[], cwd);
  }
  const grepMatches = fallbackGrep(cwd, query);
  return formatSearchResults(null, grepMatches, cwd);
}

async function handleSymbolHover(
  manager: LspManager,
  params: LspToolParams,
  _cwd: string,
): Promise<string> {
  const validation = validateNonEmptyString(params.symbol, "symbol", "symbol_hover");
  if (typeof validation === "string") return validation;
  const symbol = validation.value;

  const symbols = await manager.workspaceSymbol(symbol);
  if (!symbols || symbols.length === 0) {
    return `Symbol "${symbol}" not found.`;
  }

  // Use the first match arbitrarily; LSP servers return results in their own
  // order. The agent can use workspace_symbol or search to disambiguate.
  const match = symbols[0];
  const filePath = uriToFile(match.location.uri);
  const client = await manager.ensureFileOpen(filePath);
  if (!client) return noServerMessage(filePath);

  const hover = await client.hover(filePath, match.location.range.start);
  if (!hover) return `No hover information available for "${symbol}".`;

  let result = formatHover(hover);
  if (symbols.length > 1) {
    result += `\n\n(${symbols.length - 1} other match${symbols.length === 2 ? "" : "es"} found — use workspace_symbol or search to disambiguate)`;
  }
  return result;
}

interface RecoveryAssessmentLike {
  suspected: boolean;
  matchedFiles: Array<{ file: string; diagnostics: unknown[] }>;
  warning: string | null;
}

interface RecoveryResultLike {
  refreshedClients: number;
  restartedClients: number;
  staleAssessment: RecoveryAssessmentLike;
}

async function handleRecover(manager: LspManager): Promise<string> {
  const result = await manager.recoverWorkspaceDiagnostics({ restartIfStillStale: true });
  return formatRecoveryResult(result);
}

function formatRecoveryResult(result: RecoveryResultLike): string {
  const refreshed = pluralize(result.refreshedClients, "client");
  const restarted = pluralize(result.restartedClients, "client");
  const status = result.staleAssessment.suspected
    ? "stale diagnostics still suspected"
    : "stale diagnostics cleared";
  const warning = result.staleAssessment.warning ? ` — ${result.staleAssessment.warning}` : "";

  return `LSP recovery complete: refreshed ${refreshed}, restarted ${restarted}, ${status}${warning}.`;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
