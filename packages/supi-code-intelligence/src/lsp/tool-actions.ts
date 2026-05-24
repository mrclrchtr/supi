// LSP tool actions — service-backed execution helpers for the umbrella LSP adapter.
//
// These modules consume the public `@mrclrchtr/supi-lsp/api` surface and format
// results for model consumption. They are the same logic that lived in
// `packages/supi-lsp/src/tool/service-actions.ts`, adapted to import from the
// public API instead of internal paths.

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveToolPath } from "@mrclrchtr/supi-core/api";
import type { Position, SessionLspService } from "@mrclrchtr/supi-lsp/api";
import {
  formatCodeActions,
  formatDiagnostics,
  formatError,
  formatHover,
  formatLocations,
  formatRename,
  formatSymbolInformation,
  formatSymbols,
  formatWorkspaceDiagnosticSummary,
} from "./tool-actions-format.ts";

function validatePosition(line: number, character: number): string | null {
  if (!Number.isInteger(line) || line < 1) {
    return "Validation error: `line` must be a positive 1-based integer.";
  }
  if (!Number.isInteger(character) || character < 1) {
    return "Validation error: `character` must be a positive 1-based integer.";
  }
  return null;
}

function toZeroBased(line: number, character: number): Position {
  return { line: line - 1, character: character - 1 };
}

function noServerMessage(filePath: string): string {
  return `No LSP server available for this file type (${path.extname(filePath) || "unknown"})`;
}

function fileExists(service: SessionLspService, cwd: string, file: string): string | null {
  // Use resolveToolPath to handle pi-style @ prefix convention
  const resolvedPath = resolveToolPath(cwd, file);
  if (!fs.existsSync(resolvedPath)) {
    return `File not found: \`${file}\``;
  }
  if (!service.isSupportedSourceFile(file)) {
    return noServerMessage(resolvedPath);
  }
  return null;
}

// ── Hover ─────────────────────────────────────────────────────────────

export async function executeHover(
  service: SessionLspService,
  cwd: string,
  params: { file: string; line: number; character: number },
): Promise<string> {
  const posErr = validatePosition(params.line, params.character);
  if (posErr) return posErr;
  const fileErr = fileExists(service, cwd, params.file);
  if (fileErr) return fileErr;

  try {
    const result = await service.hover(params.file, toZeroBased(params.line, params.character));
    if (!result) return "No hover information available at this position.";
    return formatHover(result);
  } catch (err) {
    return formatError("Hover request failed", err);
  }
}

// ── Definition ────────────────────────────────────────────────────────

export async function executeDefinition(
  service: SessionLspService,
  cwd: string,
  params: { file: string; line: number; character: number },
): Promise<string> {
  const posErr = validatePosition(params.line, params.character);
  if (posErr) return posErr;
  const fileErr = fileExists(service, cwd, params.file);
  if (fileErr) return fileErr;

  try {
    const result = await service.definition(
      params.file,
      toZeroBased(params.line, params.character),
    );
    if (!result) return "No definition found at this position.";
    return formatLocations(result);
  } catch (err) {
    return formatError("Definition request failed", err);
  }
}

// ── References ─────────────────────────────────────────────────────────

export async function executeReferences(
  service: SessionLspService,
  cwd: string,
  params: { file: string; line: number; character: number },
): Promise<string> {
  const posErr = validatePosition(params.line, params.character);
  if (posErr) return posErr;
  const fileErr = fileExists(service, cwd, params.file);
  if (fileErr) return fileErr;

  try {
    const result = await service.references(
      params.file,
      toZeroBased(params.line, params.character),
    );
    if (!result || result.length === 0) return "No references found.";
    return formatLocations(result);
  } catch (err) {
    return formatError("References request failed", err);
  }
}

// ── Implementation ────────────────────────────────────────────────────

export async function executeImplementation(
  service: SessionLspService,
  cwd: string,
  params: { file: string; line: number; character: number },
): Promise<string> {
  const posErr = validatePosition(params.line, params.character);
  if (posErr) return posErr;
  const fileErr = fileExists(service, cwd, params.file);
  if (fileErr) return fileErr;

  try {
    const result = await service.implementation(
      params.file,
      toZeroBased(params.line, params.character),
    );
    if (!result) return "No implementations found.";
    return formatLocations(result);
  } catch (err) {
    return formatError("Implementation request failed", err);
  }
}

// ── Document Symbols ──────────────────────────────────────────────────

export async function executeDocumentSymbols(
  service: SessionLspService,
  cwd: string,
  params: { file: string },
): Promise<string> {
  const resolvedPath = resolveToolPath(cwd, params.file);
  if (!fs.existsSync(resolvedPath)) {
    return `File not found: \`${params.file}\``;
  }

  try {
    const result = await service.documentSymbols(params.file);
    if (!result || (Array.isArray(result) && result.length === 0)) {
      return "No symbols found in this file.";
    }
    return formatSymbols(result);
  } catch (err) {
    return formatError("Document symbols request failed", err);
  }
}

// ── Workspace Symbols ─────────────────────────────────────────────────

export async function executeWorkspaceSymbols(
  service: SessionLspService,
  cwd: string,
  params: { query: string },
): Promise<string> {
  if (!params.query || params.query.trim().length === 0) {
    return "Validation error: `query` is required.";
  }

  try {
    const result = await service.workspaceSymbol(params.query);
    if (!result || result.length === 0) {
      return `No symbols found matching \`${params.query}\`.`;
    }
    return formatSymbolInformation(result, cwd);
  } catch (err) {
    return formatError("Workspace symbols request failed", err);
  }
}

// ── Diagnostics ───────────────────────────────────────────────────────

export async function executeDiagnostics(
  service: SessionLspService,
  cwd: string,
  params: { file?: string },
): Promise<string> {
  try {
    if (params.file) {
      const resolvedPath = resolveToolPath(cwd, params.file);
      if (!fs.existsSync(resolvedPath)) {
        return `File not found: \`${params.file}\``;
      }
      const diags = await service.fileDiagnostics(params.file, 4);
      if (!diags || diags.length === 0) {
        return `No diagnostics for \`${params.file}\`.`;
      }
      return formatDiagnostics(diags);
    }

    const summary = service.getWorkspaceDiagnosticSummary();
    if (summary.length === 0) {
      return "No workspace diagnostics.";
    }
    return formatWorkspaceDiagnosticSummary(summary);
  } catch (err) {
    return formatError("Diagnostics request failed", err);
  }
}

// ── Rename ────────────────────────────────────────────────────────────

export async function executeRename(
  service: SessionLspService,
  cwd: string,
  params: { file: string; line: number; character: number; newName: string },
): Promise<string> {
  const posErr = validatePosition(params.line, params.character);
  if (posErr) return posErr;
  const fileErr = fileExists(service, cwd, params.file);
  if (fileErr) return fileErr;
  if (!params.newName || params.newName.trim().length === 0) {
    return "Validation error: `newName` is required.";
  }

  try {
    const result = await service.rename(
      params.file,
      toZeroBased(params.line, params.character),
      params.newName,
    );
    if (!result) return "Rename planning produced no changes.";
    return formatRename(result);
  } catch (err) {
    return formatError("Rename request failed", err);
  }
}

// ── Code Actions ──────────────────────────────────────────────────────

export async function executeCodeActions(
  service: SessionLspService,
  cwd: string,
  params: { file: string; line: number; character: number },
): Promise<string> {
  const posErr = validatePosition(params.line, params.character);
  if (posErr) return posErr;
  const fileErr = fileExists(service, cwd, params.file);
  if (fileErr) return fileErr;

  try {
    const result = await service.codeActions(
      params.file,
      toZeroBased(params.line, params.character),
    );
    if (!result || result.length === 0) return "No code actions available at this position.";
    return formatCodeActions(result);
  } catch (err) {
    return formatError("Code actions request failed", err);
  }
}

// ── Recover ───────────────────────────────────────────────────────────

export async function executeRecover(service: SessionLspService): Promise<string> {
  try {
    const result = await service.recoverDiagnostics({ restartIfStillStale: true });
    const parts: string[] = [];
    if (result.refreshedClients > 0) {
      parts.push(`Refreshed diagnostics for ${result.refreshedClients} client(s).`);
    }
    if (result.restartedClients > 0) {
      parts.push(`Restarted ${result.restartedClients} client(s).`);
    }
    if (result.staleAssessment.suspected) {
      parts.push(
        `Stale diagnostics suspected in ${result.staleAssessment.matchedFiles.length} file(s).`,
      );
      if (result.staleAssessment.warning) {
        parts.push(result.staleAssessment.warning);
      }
    }
    if (parts.length === 0) parts.push("No recovery actions taken.");
    return parts.join("\n");
  } catch (err) {
    return formatError("Recovery failed", err);
  }
}
