// Service-backed LSP tool actions used by the public expert toolset.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Position } from "../config/types.ts";
import { formatDiagnostics } from "../diagnostics/diagnostics.ts";
import {
  formatCodeActions,
  formatDocumentSymbols,
  formatHover,
  formatLocations,
  formatSymbolInformation,
  formatWorkspaceEdit,
  formatWorkspaceSymbols,
  normalizeLocations,
} from "../format.ts";
import type { SessionLspService } from "../session/service-registry.ts";
import { resolveSessionPath } from "../utils.ts";

export type LspLookupKind = "hover" | "definition" | "references" | "implementation";
export type LspRefactorKind = "rename" | "code_actions";

export interface LspLookupToolParams {
  kind: LspLookupKind;
  file: string;
  line: number;
  character: number;
}

export interface LspDocumentSymbolsToolParams {
  file: string;
}

export interface LspWorkspaceSymbolsToolParams {
  query: string;
}

export interface LspDiagnosticsToolParams {
  file?: string;
}

export interface LspRefactorToolParams {
  kind: LspRefactorKind;
  file: string;
  line: number;
  character: number;
  newName?: string;
}

function validatePositivePosition(line: number, character: number): string | null {
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

function validateFile(service: SessionLspService, cwd: string, file: string): string | null {
  const resolvedPath = resolveSessionPath(cwd, file);
  if (!fs.existsSync(resolvedPath)) {
    return `File not found: \`${file}\``;
  }
  if (!service.isSupportedSourceFile(file)) {
    return noServerMessage(resolvedPath);
  }
  return null;
}

function noServerMessage(filePath: string): string {
  return `No LSP server available for this file type (${path.extname(filePath) || "unknown"})`;
}

function formatUnexpectedFailure(label: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `LSP ${label} failed: ${message}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: semantic lookup dispatch stays clearer as a single position-based switch.
export async function executeLookup(
  service: SessionLspService,
  cwd: string,
  params: LspLookupToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;

    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;

    const position = toZeroBased(params.line, params.character);
    switch (params.kind) {
      case "hover": {
        const hover = await service.hover(params.file, position);
        return hover ? formatHover(hover) : "No hover information available at this position.";
      }
      case "definition": {
        const result = await service.definition(params.file, position);
        if (!result) return "No definition found.";
        const locations = normalizeLocations(result);
        return locations.length > 0
          ? formatLocations("Definition", locations, cwd)
          : "No definition found.";
      }
      case "references": {
        const references = await service.references(params.file, position);
        return references && references.length > 0
          ? formatLocations("References", references, cwd)
          : "No references found.";
      }
      case "implementation": {
        const result = await service.implementation(params.file, position);
        if (!result) return "No implementation found.";
        const locations = normalizeLocations(result);
        return locations.length > 0
          ? formatLocations("Implementation", locations, cwd)
          : "No implementation found.";
      }
    }
  } catch (error) {
    return formatUnexpectedFailure("lookup", error);
  }
}

// ---------------------------------------------------------------------------
// Focused lookup tools (replacing the old multiplexed executeLookup)
// ---------------------------------------------------------------------------

export interface LspPositionToolParams {
  file: string;
  line: number;
  character: number;
}

export interface LspRenameToolParams {
  file: string;
  line: number;
  character: number;
  newName: string;
}

export async function executeHover(
  service: SessionLspService,
  cwd: string,
  params: LspPositionToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;
    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;
    const position = toZeroBased(params.line, params.character);
    const hover = await service.hover(params.file, position);
    return hover ? formatHover(hover) : "No hover information available at this position.";
  } catch (error) {
    return formatUnexpectedFailure("hover", error);
  }
}

export async function executeDefinition(
  service: SessionLspService,
  cwd: string,
  params: LspPositionToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;
    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;
    const position = toZeroBased(params.line, params.character);
    const result = await service.definition(params.file, position);
    if (!result) return "No definition found.";
    const locations = normalizeLocations(result);
    return locations.length > 0
      ? formatLocations("Definition", locations, cwd)
      : "No definition found.";
  } catch (error) {
    return formatUnexpectedFailure("definition", error);
  }
}

export async function executeReferences(
  service: SessionLspService,
  cwd: string,
  params: LspPositionToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;
    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;
    const position = toZeroBased(params.line, params.character);
    const references = await service.references(params.file, position);
    return references && references.length > 0
      ? formatLocations("References", references, cwd)
      : "No references found.";
  } catch (error) {
    return formatUnexpectedFailure("references", error);
  }
}

export async function executeImplementation(
  service: SessionLspService,
  cwd: string,
  params: LspPositionToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;
    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;
    const position = toZeroBased(params.line, params.character);
    const result = await service.implementation(params.file, position);
    if (!result) return "No implementation found.";
    const locations = normalizeLocations(result);
    return locations.length > 0
      ? formatLocations("Implementation", locations, cwd)
      : "No implementation found.";
  } catch (error) {
    return formatUnexpectedFailure("implementation", error);
  }
}

export async function executeRename(
  service: SessionLspService,
  cwd: string,
  params: LspRenameToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;
    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;
    const newName = params.newName?.trim();
    if (!newName) {
      return "Validation error: `newName` is required for rename.";
    }
    const position = toZeroBased(params.line, params.character);
    const edit = await service.rename(params.file, position, newName);
    return edit ? formatWorkspaceEdit(edit, cwd) : "Rename not available at this position.";
  } catch (error) {
    return formatUnexpectedFailure("rename", error);
  }
}

export async function executeCodeActions(
  service: SessionLspService,
  cwd: string,
  params: LspPositionToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;
    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;
    const position = toZeroBased(params.line, params.character);
    const actions = await service.codeActions(params.file, position);
    return actions && actions.length > 0
      ? formatCodeActions(actions)
      : "No code actions available at this position.";
  } catch (error) {
    return formatUnexpectedFailure("code actions", error);
  }
}

export async function executeDocumentSymbols(
  service: SessionLspService,
  cwd: string,
  params: LspDocumentSymbolsToolParams,
): Promise<string> {
  try {
    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;

    const symbols = await service.documentSymbols(params.file);
    if (!symbols || symbols.length === 0) return "No document symbols found.";

    if ("children" in symbols[0] || "selectionRange" in symbols[0]) {
      return formatDocumentSymbols(symbols as import("../config/types.ts").DocumentSymbol[], 0);
    }
    return formatSymbolInformation(
      symbols as import("../config/types.ts").SymbolInformation[],
      cwd,
    );
  } catch (error) {
    return formatUnexpectedFailure("document symbol lookup", error);
  }
}

export async function executeWorkspaceSymbols(
  service: SessionLspService,
  cwd: string,
  params: LspWorkspaceSymbolsToolParams,
): Promise<string> {
  try {
    const query = params.query.trim();
    if (query.length === 0) {
      return "Validation error: `query` must be a non-empty string.";
    }

    const symbols = await service.workspaceSymbol(query);
    if (!symbols) return "Workspace symbol search is not supported by the active language servers.";
    if (symbols.length === 0) return `No symbols found for query \`${query}\`.`;

    return formatWorkspaceSymbols(symbols, cwd);
  } catch (error) {
    return formatUnexpectedFailure("workspace symbol lookup", error);
  }
}

export async function executeDiagnostics(
  service: SessionLspService,
  cwd: string,
  params: LspDiagnosticsToolParams,
): Promise<string> {
  try {
    if (params.file) {
      const resolvedPath = resolveSessionPath(cwd, params.file);
      if (!fs.existsSync(resolvedPath)) {
        return `File not found: \`${params.file}\``;
      }
      if (!service.isSupportedSourceFile(params.file)) {
        return noServerMessage(resolvedPath);
      }

      const diagnostics = await service.fileDiagnostics(params.file, 4);
      if (!diagnostics) return noServerMessage(resolvedPath);
      return formatDiagnostics(resolvedPath, diagnostics, cwd);
    }

    const summary = service.getWorkspaceDiagnosticSummary();
    if (summary.length === 0) return "No diagnostics across any files.";

    const lines = ["## Diagnostics Summary", ""];
    for (const entry of summary) {
      lines.push(`- **${entry.file}**: ${entry.errors} error(s), ${entry.warnings} warning(s)`);
    }
    return lines.join("\n");
  } catch (error) {
    return formatUnexpectedFailure("diagnostics", error);
  }
}

export async function executeRefactor(
  service: SessionLspService,
  cwd: string,
  params: LspRefactorToolParams,
): Promise<string> {
  try {
    const positionError = validatePositivePosition(params.line, params.character);
    if (positionError) return positionError;

    const fileError = validateFile(service, cwd, params.file);
    if (fileError) return fileError;

    const position = toZeroBased(params.line, params.character);

    if (params.kind === "rename") {
      if (!params.newName || params.newName.trim().length === 0) {
        return "Validation error: `newName` is required for rename.";
      }

      const edit = await service.rename(params.file, position, params.newName.trim());
      return edit ? formatWorkspaceEdit(edit, cwd) : "Rename not available at this position.";
    }

    const actions = await service.codeActions(params.file, position);
    return actions && actions.length > 0
      ? formatCodeActions(actions)
      : "No code actions available at this position.";
  } catch (error) {
    return formatUnexpectedFailure("refactor", error);
  }
}

export async function executeRecover(service: SessionLspService): Promise<string> {
  try {
    const result = await service.recoverDiagnostics({ restartIfStillStale: true });
    const refreshed = pluralize(result.refreshedClients, "client");
    const restarted = pluralize(result.restartedClients, "client");
    const status = result.staleAssessment.suspected
      ? "stale diagnostics still suspected"
      : "stale diagnostics cleared";
    const warning = result.staleAssessment.warning ? ` — ${result.staleAssessment.warning}` : "";
    return `LSP recovery complete: refreshed ${refreshed}, restarted ${restarted}, ${status}${warning}.`;
  } catch (error) {
    return formatUnexpectedFailure("recovery", error);
  }
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
