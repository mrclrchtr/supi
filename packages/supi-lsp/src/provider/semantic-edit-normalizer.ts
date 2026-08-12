import { fileURLToPath } from "node:url";
import type {
  DocumentEditPrecondition,
  FileEdit,
  RefactorResult,
} from "@mrclrchtr/supi-code-runtime/api";

/** A complete semantic server response that can contain precise text edits. */
export type SemanticEditResponse =
  | { readonly kind: "workspace-edit"; readonly edit: unknown }
  | { readonly kind: "code-action"; readonly action: unknown };

/** Client document state used to establish edit version preconditions. */
export interface SemanticEditNormalizationContext {
  getOpenDocumentVersion(file: string): number | null;
}

/**
 * Convert one complete semantic server response to a protocol-neutral edit plan.
 * Reject the complete response when any part is not supported.
 */
export function normalizeSemanticEdit(
  response: SemanticEditResponse,
  context: SemanticEditNormalizationContext,
): RefactorResult {
  return response.kind === "code-action"
    ? normalizeCodeAction(response.action, context)
    : normalizeWorkspaceEdit(response.edit, context);
}

function normalizeCodeAction(
  value: unknown,
  context: SemanticEditNormalizationContext,
): RefactorResult {
  const action = asRecord(value);
  if (
    !action ||
    typeof action.title !== "string" ||
    !hasOnlyKeys(action, [
      "title",
      "kind",
      "diagnostics",
      "isPreferred",
      "disabled",
      "edit",
      "command",
      "data",
    ])
  ) {
    return { kind: "unavailable", reason: "LSP server returned a malformed code action." };
  }
  const title = action.title;
  if (Object.hasOwn(action, "disabled")) {
    return { kind: "unavailable", reason: `Code action "${title}" is disabled.` };
  }
  if (Object.hasOwn(action, "command")) {
    return {
      kind: "unavailable",
      reason: `Code action "${title}" requires a command and cannot become an edit-only precise plan.`,
    };
  }
  if (!Object.hasOwn(action, "edit")) {
    return { kind: "unavailable", reason: `Code action "${title}" has no edit` };
  }
  const result = normalizeWorkspaceEdit(action.edit, context);
  return result.kind === "unavailable"
    ? {
        kind: "unavailable",
        reason: `Code action "${title}" could not produce precise edits: ${result.reason}`,
      }
    : result;
}

function normalizeWorkspaceEdit(
  value: unknown,
  context: SemanticEditNormalizationContext,
): RefactorResult {
  if (value === null || value === undefined) {
    return { kind: "unavailable", reason: "LSP server returned no edit." };
  }
  const workspaceEdit = asRecord(value);
  if (
    !workspaceEdit ||
    !hasOnlyKeys(workspaceEdit, ["changes", "documentChanges", "changeAnnotations"])
  ) {
    return { kind: "unavailable", reason: "LSP server returned a malformed workspace edit." };
  }
  if (Object.hasOwn(workspaceEdit, "changeAnnotations")) {
    return {
      kind: "unavailable",
      reason: "Workspace edit contains unsupported change annotations.",
    };
  }
  return Object.hasOwn(workspaceEdit, "documentChanges")
    ? normalizeDocumentChanges(workspaceEdit.documentChanges, context)
    : normalizeChanges(workspaceEdit.changes);
}

function normalizeChanges(value: unknown): RefactorResult {
  const changes = asRecord(value);
  if (!changes) {
    return { kind: "unavailable", reason: "Workspace edit contains no supported changes." };
  }

  const edits: FileEdit[] = [];
  for (const uri of Object.keys(changes).sort()) {
    const file = toFilePath(uri);
    const textEdits = changes[uri];
    if (!file) {
      return { kind: "unavailable", reason: `Workspace edit URI "${uri}" is not a file URI.` };
    }
    if (!Array.isArray(textEdits)) {
      return { kind: "unavailable", reason: "Workspace edit contains malformed changes." };
    }
    const normalized = normalizeTextEdits(file, textEdits);
    if (normalized.kind === "unavailable") return normalized;
    edits.push(...normalized.edits);
  }
  return preciseOrEmpty(edits);
}

function normalizeDocumentChanges(
  value: unknown,
  context: SemanticEditNormalizationContext,
): RefactorResult {
  if (!Array.isArray(value)) {
    return { kind: "unavailable", reason: "Workspace edit has malformed documentChanges." };
  }

  const edits: FileEdit[] = [];
  const documentPreconditions: DocumentEditPrecondition[] = [];
  for (const change of value) {
    const normalized = normalizeDocumentChange(change, context);
    if (normalized.kind === "unavailable") return normalized;
    edits.push(...normalized.edits);
    documentPreconditions.push(normalized.precondition);
  }
  return preciseOrEmpty(edits, documentPreconditions);
}

function normalizeDocumentChange(
  value: unknown,
  context: SemanticEditNormalizationContext,
):
  | { kind: "precise"; edits: FileEdit[]; precondition: DocumentEditPrecondition }
  | { kind: "unavailable"; reason: string } {
  const documentEdit = asRecord(value);
  const resourceKind = getResourceOperationKind(documentEdit);
  if (resourceKind) {
    return {
      kind: "unavailable",
      reason: `Workspace edit contains the unsupported "${resourceKind}" resource operation.`,
    };
  }
  const parsed = parseTextDocumentEdit(documentEdit);
  if (!parsed) {
    return { kind: "unavailable", reason: "Workspace edit has a malformed document change." };
  }
  const { edit, textDocument } = parsed;
  const file = typeof textDocument.uri === "string" ? toFilePath(textDocument.uri) : null;
  if (!file) {
    return { kind: "unavailable", reason: "Document change does not contain a valid file URI." };
  }
  if (!("version" in textDocument)) {
    return { kind: "unavailable", reason: "Document change does not contain a version." };
  }
  const precondition = establishPrecondition(file, textDocument.version, context);
  if (typeof precondition === "string") {
    return { kind: "unavailable", reason: precondition };
  }
  const normalized = normalizeTextEdits(file, edit.edits);
  return normalized.kind === "unavailable"
    ? normalized
    : { kind: "precise", edits: normalized.edits, precondition };
}

function parseTextDocumentEdit(edit: Record<string, unknown> | null): {
  edit: Record<"textDocument" | "edits", unknown> & { edits: unknown[] };
  textDocument: Record<string, unknown>;
} | null {
  const textDocument = asRecord(edit?.textDocument);
  if (
    !edit ||
    !hasOnlyKeys(edit, ["textDocument", "edits"]) ||
    !textDocument ||
    !hasOnlyKeys(textDocument, ["uri", "version"]) ||
    !Array.isArray(edit.edits)
  ) {
    return null;
  }
  return {
    edit: edit as Record<"textDocument" | "edits", unknown> & { edits: unknown[] },
    textDocument,
  };
}

function getResourceOperationKind(value: Record<string, unknown> | null): string | null {
  return value && (value.kind === "create" || value.kind === "rename" || value.kind === "delete")
    ? value.kind
    : null;
}

function establishPrecondition(
  file: string,
  version: unknown,
  context: SemanticEditNormalizationContext,
): DocumentEditPrecondition | string {
  const openVersion = context.getOpenDocumentVersion(file);
  if (version === null) {
    return openVersion === null
      ? { file, kind: "disk-content" }
      : `Document change for "${file}" requires disk content, but the document is open.`;
  }
  if (!Number.isInteger(version) || (version as number) < 0) {
    return `Document change for "${file}" has an invalid version.`;
  }
  if (openVersion === null) {
    return `Document change version for "${file}" cannot be established.`;
  }
  if (openVersion !== version) {
    return `Document change version for "${file}" does not match the open document.`;
  }
  return { file, kind: "open-document-version", version: version as number };
}

function normalizeTextEdits(
  file: string,
  values: unknown[],
): { kind: "precise"; edits: FileEdit[] } | { kind: "unavailable"; reason: string } {
  const edits: FileEdit[] = [];
  for (const value of values) {
    const textEdit = asRecord(value);
    if (textEdit && Object.hasOwn(textEdit, "snippet")) {
      return { kind: "unavailable", reason: "Workspace edit contains a snippet text edit." };
    }
    if (textEdit && Object.hasOwn(textEdit, "annotationId")) {
      return { kind: "unavailable", reason: "Workspace edit contains a text edit annotation." };
    }
    const range = asRecord(textEdit?.range);
    const start = asPosition(range?.start);
    const end = asPosition(range?.end);
    if (
      !textEdit ||
      !hasOnlyKeys(textEdit, ["range", "newText"]) ||
      !range ||
      !hasOnlyKeys(range, ["start", "end"]) ||
      !start ||
      !end ||
      isBefore(end, start) ||
      typeof textEdit.newText !== "string"
    ) {
      return { kind: "unavailable", reason: "Workspace edit contains a malformed text edit." };
    }
    edits.push({ file, range: { start, end }, newText: textEdit.newText });
  }
  return { kind: "precise", edits };
}

function preciseOrEmpty(
  edits: FileEdit[],
  documentPreconditions?: DocumentEditPrecondition[],
): RefactorResult {
  if (edits.length === 0) {
    return { kind: "unavailable", reason: "Workspace edit contains no file edits." };
  }
  return documentPreconditions
    ? { kind: "precise", edits: { edits, documentPreconditions } }
    : { kind: "precise", edits: { edits } };
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asPosition(value: unknown): { line: number; character: number } | null {
  const position = asRecord(value);
  return position &&
    hasOnlyKeys(position, ["line", "character"]) &&
    Number.isInteger(position.line) &&
    (position.line as number) >= 0 &&
    Number.isInteger(position.character) &&
    (position.character as number) >= 0
    ? { line: position.line as number, character: position.character as number }
    : null;
}

function isBefore(
  left: { line: number; character: number },
  right: { line: number; character: number },
): boolean {
  return left.line < right.line || (left.line === right.line && left.character < right.character);
}

function toFilePath(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "file:" ? fileURLToPath(parsed) : null;
  } catch {
    return null;
  }
}
