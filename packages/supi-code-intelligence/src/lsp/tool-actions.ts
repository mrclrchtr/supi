// LSP tool execution adapters — delegates to supi-lsp's service layer.
//
// Each tool maps to a method on SessionLspService from @mrclrchtr/supi-lsp/api.

import * as fs from "node:fs";
import * as nodePath from "node:path";
import type { Position, SessionLspService } from "@mrclrchtr/supi-lsp/api";
import {
  diagnosticSeverityLabel,
  formatHover,
  formatLocation,
  formatSummaryEntry,
  symbolKindName,
} from "./format-utils.ts";

// ── Param types ───────────────────────────────────────────────────────

interface PosParams {
  file: string;
  line: number;
  character: number;
}
interface FileParams {
  file: string;
}
interface QueryParams {
  query: string;
}
interface DiagParams {
  file?: string;
}
interface RenameParams extends PosParams {
  newName: string;
}

// ── Coord helpers ─────────────────────────────────────────────────────

function toZeroBased(line: number, character: number): Position {
  return { line: line - 1, character: character - 1 };
}

function validatePos(line: number, character: number): string | null {
  if (!Number.isInteger(line) || line < 1)
    return "Validation error: `line` must be a positive 1-based integer.";
  if (!Number.isInteger(character) || character < 1)
    return "Validation error: `character` must be a positive 1-based integer.";
  return null;
}

function resolveSessionPath(cwd: string, filePath: string): string {
  if (nodePath.isAbsolute(filePath)) return filePath;
  if (filePath.startsWith("@")) return nodePath.resolve(cwd, filePath.slice(1));
  return nodePath.resolve(cwd, filePath);
}

function validateFile(service: SessionLspService, cwd: string, file: string): string | null {
  const resolvedPath = resolveSessionPath(cwd, file);
  if (!fs.existsSync(resolvedPath)) {
    return `File not found: \`${file}\``;
  }
  if (!service.isSupportedSourceFile(file)) {
    return `No LSP server available for this file type (${nodePath.extname(resolvedPath) || "unknown"})`;
  }
  return null;
}

function formatUnexpectedFailure(label: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `**Error:** ${label} failed: ${message}`;
}

// ── Tool dispatch ─────────────────────────────────────────────────────

export async function executeLspTool(
  toolName: string,
  service: SessionLspService,
  cwd: string,
  params: unknown,
): Promise<string> {
  switch (toolName) {
    case "lsp_hover":
      return executeHover(service, cwd, params as PosParams);
    case "lsp_definition":
      return executeDef(service, cwd, params as PosParams);
    case "lsp_references":
      return executeRefs(service, cwd, params as PosParams);
    case "lsp_implementation":
      return executeImpl(service, cwd, params as PosParams);
    case "lsp_document_symbols":
      return executeDocSyms(service, cwd, params as FileParams);
    case "lsp_workspace_symbols":
      return executeWsSyms(service, params as QueryParams);
    case "lsp_diagnostics":
      return executeDiags(service, cwd, params as DiagParams);
    case "lsp_rename":
      return executeRename(service, cwd, params as RenameParams);
    case "lsp_code_actions":
      return executeActions(service, cwd, params as PosParams);
    case "lsp_recover":
      return executeRecover(service);
    default:
      return `Unknown LSP tool: ${toolName}`;
  }
}

async function executeHover(
  service: SessionLspService,
  cwd: string,
  p: PosParams,
): Promise<string> {
  const err = validatePos(p.line, p.character);
  if (err) return err;
  const fileErr = validateFile(service, cwd, p.file);
  if (fileErr) return fileErr;
  try {
    const result = await service.hover(p.file, toZeroBased(p.line, p.character));
    if (!result) return "No hover information available.";
    return formatHover(result.contents);
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_hover", error);
  }
}

async function executeDef(service: SessionLspService, cwd: string, p: PosParams): Promise<string> {
  const err = validatePos(p.line, p.character);
  if (err) return err;
  const fileErr = validateFile(service, cwd, p.file);
  if (fileErr) return fileErr;
  try {
    const result = await service.definition(p.file, toZeroBased(p.line, p.character));
    if (!result) return "No definition found.";
    return formatLocations(result);
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_definition", error);
  }
}

async function executeRefs(service: SessionLspService, cwd: string, p: PosParams): Promise<string> {
  const err = validatePos(p.line, p.character);
  if (err) return err;
  const fileErr = validateFile(service, cwd, p.file);
  if (fileErr) return fileErr;
  try {
    const result = await service.references(p.file, toZeroBased(p.line, p.character));
    if (!result || result.length === 0) return "No references found.";
    return result
      .map((loc) => formatLocation(loc.uri, loc.range.start.line, loc.range.start.character))
      .join("\n");
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_references", error);
  }
}

async function executeImpl(service: SessionLspService, cwd: string, p: PosParams): Promise<string> {
  const err = validatePos(p.line, p.character);
  if (err) return err;
  const fileErr = validateFile(service, cwd, p.file);
  if (fileErr) return fileErr;
  try {
    const result = await service.implementation(p.file, toZeroBased(p.line, p.character));
    if (!result) return "No implementations found.";
    return formatLocations(result);
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_implementation", error);
  }
}

async function executeDocSyms(
  service: SessionLspService,
  cwd: string,
  p: FileParams,
): Promise<string> {
  const fileErr = validateFile(service, cwd, p.file);
  if (fileErr) return fileErr;
  try {
    const result = await service.documentSymbols(p.file);
    if (!result || result.length === 0) return "No symbols found.";
    return result.map((sym) => `  ${symbolKindName(sym.kind)}: ${sym.name}`).join("\n");
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_document_symbols", error);
  }
}

async function executeWsSyms(service: SessionLspService, p: QueryParams): Promise<string> {
  if (!p.query || p.query.trim().length === 0) {
    return "Validation error: `query` is required.";
  }
  try {
    const result = await service.workspaceSymbol(p.query);
    if (!result || result.length === 0) return "No symbols found.";
    return result
      .map((sym) => {
        const loc = sym.location;
        const file = loc ? (loc.uri.split("/").pop() ?? "") : "";
        const range =
          loc && "range" in loc ? (loc as { range: { start: { line: number } } }).range : null;
        const line = range ? range.start.line + 1 : 0;
        return `  ${symbolKindName(sym.kind)}: ${sym.name} (${file}:${line})`;
      })
      .join("\n");
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_workspace_symbols", error);
  }
}

async function executeDiags(
  service: SessionLspService,
  cwd: string,
  p: DiagParams,
): Promise<string> {
  if (p.file) {
    const fileErr = validateFile(service, cwd, p.file);
    if (fileErr) return fileErr;
    try {
      const diagnostics = await service.fileDiagnostics(p.file, 4);
      if (!diagnostics || diagnostics.length === 0) return "No diagnostics.";
      return diagnostics
        .map(
          (d) =>
            `  ${d.range.start.line + 1}: ${diagnosticSeverityLabel(d.severity ?? 1)}: ${d.message}`,
        )
        .join("\n");
    } catch (error: unknown) {
      return formatUnexpectedFailure("lsp_diagnostics", error);
    }
  }
  try {
    const summary = service.getWorkspaceDiagnosticSummary();
    if (summary.length === 0) return "No workspace diagnostics.";
    return summary.map(formatSummaryEntry).join("\n");
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_diagnostics", error);
  }
}

async function executeRename(
  service: SessionLspService,
  cwd: string,
  p: RenameParams,
): Promise<string> {
  const err = validatePos(p.line, p.character);
  if (err) return err;
  const fileErr = validateFile(service, cwd, p.file);
  if (fileErr) return fileErr;
  try {
    const result = await service.rename(p.file, toZeroBased(p.line, p.character), p.newName);
    if (!result) return "Rename not supported.";
    return "Rename planned — use code_refactor_apply with the returned planId to apply.";
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_rename", error);
  }
}

async function executeActions(
  service: SessionLspService,
  cwd: string,
  p: PosParams,
): Promise<string> {
  const err = validatePos(p.line, p.character);
  if (err) return err;
  const fileErr = validateFile(service, cwd, p.file);
  if (fileErr) return fileErr;
  try {
    const result = await service.codeActions(p.file, toZeroBased(p.line, p.character));
    if (!result || result.length === 0) return "No code actions available.";
    return result.map((a) => `  ${a.title}\n`).join("\n");
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_code_actions", error);
  }
}

async function executeRecover(service: SessionLspService): Promise<string> {
  try {
    const result = await service.recoverDiagnostics({ restartIfStillStale: true });
    return `Refreshed ${result.refreshedClients} client(s), restarted ${result.restartedClients} client(s).`;
  } catch (error: unknown) {
    return formatUnexpectedFailure("lsp_recover", error);
  }
}

// ── Location formatting ───────────────────────────────────────────────

function formatLocations(
  result: Parameters<SessionLspService["definition"]>[0] extends never
    ? never
    : Awaited<ReturnType<SessionLspService["definition"]>>,
): string {
  if (!result) return "No results.";
  const items = Array.isArray(result) ? result : [result];
  if (items.length === 0) return "No results.";
  return items
    .map((item: Record<string, unknown>) => {
      const uri = (item.uri as string) ?? (item.targetUri as string) ?? "";
      const range = (item.range as {
        start: { line: number; character: number };
        end: { line: number; character: number };
      }) ??
        (item.targetRange as {
          start: { line: number; character: number };
          end: { line: number; character: number };
        }) ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      return formatLocation(uri, range.start.line, range.start.character);
    })
    .join("\n");
}
