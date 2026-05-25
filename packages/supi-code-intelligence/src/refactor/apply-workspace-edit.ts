/**
 * Direct-apply file mutation path for precise workspace edits.
 *
 * Writes edits atomically per-file: all transformed content is precomputed
 * in memory before any file is written, so a mid-apply failure never
 * leaves the workspace half-renamed.
 *
 * Edits are sorted by descending absolute offset (line + character)
 * so same-line edits are applied right-to-left regardless of order.
 *
 * Only called after safety validation has passed.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { FileEdit, WorkspaceEdit } from "@mrclrchtr/supi-code-runtime/api";
import { validateEditAgainstFiles } from "./safety.ts";

export type ApplyResult =
  | { kind: "applied"; filesChanged: number; totalEdits: number }
  | { kind: "error"; reason: string };

/**
 * Apply a validated WorkspaceEdit to the filesystem.
 *
 * Precomputes every file's new content in memory first, then commits
 * all writes. If a commit fails after some files were already written,
 * the function rolls those files back to their original contents.
 */
export function applyWorkspaceEdit(edit: WorkspaceEdit): ApplyResult {
  const validation = validateEditAgainstFiles(edit);
  if (!validation.safe) {
    return { kind: "error", reason: validation.reason };
  }

  const grouped = groupEditsByFile(edit.edits);
  const originalContents = readOriginalContents(grouped);
  if (originalContents.kind === "error") return originalContents;

  const transformedContents = buildTransformedContents(grouped, originalContents.contents);
  return commitTransformedContents(
    transformedContents,
    originalContents.contents,
    edit.edits.length,
  );
}

function groupEditsByFile(edits: FileEdit[]): Map<string, FileEdit[]> {
  const grouped = new Map<string, FileEdit[]>();
  for (const fileEdit of edits) {
    const group = grouped.get(fileEdit.file) ?? [];
    group.push(fileEdit);
    grouped.set(fileEdit.file, group);
  }
  return grouped;
}

function readOriginalContents(
  grouped: Map<string, FileEdit[]>,
): { kind: "ok"; contents: Map<string, string> } | { kind: "error"; reason: string } {
  const contents = new Map<string, string>();

  try {
    for (const file of [...grouped.keys()].sort()) {
      contents.set(file, readFileSync(file, "utf-8"));
    }
  } catch (error) {
    return { kind: "error", reason: toErrorMessage(error) };
  }

  return { kind: "ok", contents };
}

function buildTransformedContents(
  grouped: Map<string, FileEdit[]>,
  originalContents: Map<string, string>,
): Map<string, string> {
  const transformed = new Map<string, string>();

  for (const [file, edits] of grouped) {
    const originalContent = originalContents.get(file) ?? "";
    transformed.set(file, applyEditsToContent(originalContent, edits));
  }

  return transformed;
}

function applyEditsToContent(content: string, edits: FileEdit[]): string {
  const lines = content.split("\n");
  const sortedEdits = [...edits].sort(
    (left, right) =>
      absoluteOffset(right.range.start.line, right.range.start.character) -
      absoluteOffset(left.range.start.line, left.range.start.character),
  );

  let updated = content;
  for (const fileEdit of sortedEdits) {
    const startOffset = toOffset(lines, fileEdit.range.start.line, fileEdit.range.start.character);
    const endOffset = toOffset(lines, fileEdit.range.end.line, fileEdit.range.end.character);
    updated = updated.slice(0, startOffset) + fileEdit.newText + updated.slice(endOffset);
  }

  return updated;
}

function commitTransformedContents(
  transformedContents: Map<string, string>,
  originalContents: Map<string, string>,
  totalEdits: number,
): ApplyResult {
  const writtenFiles: string[] = [];

  try {
    for (const file of [...transformedContents.keys()].sort()) {
      writeFileSync(file, transformedContents.get(file) ?? "", "utf-8");
      writtenFiles.push(file);
    }
  } catch (error) {
    const rollbackError = rollbackWrittenFiles(writtenFiles, originalContents);
    return {
      kind: "error",
      reason: rollbackError
        ? `${toErrorMessage(error)} (rollback failed: ${rollbackError})`
        : toErrorMessage(error),
    };
  }

  return {
    kind: "applied",
    filesChanged: transformedContents.size,
    totalEdits,
  };
}

function rollbackWrittenFiles(
  writtenFiles: string[],
  originalContents: Map<string, string>,
): string | null {
  try {
    for (const file of writtenFiles.reverse()) {
      writeFileSync(file, originalContents.get(file) ?? "", "utf-8");
    }
    return null;
  } catch (error) {
    return toErrorMessage(error);
  }
}

function absoluteOffset(line: number, character: number): number {
  return line * 1_000_000 + character;
}

function toOffset(lines: string[], line: number, character: number): number {
  let offset = 0;
  for (let index = 0; index < line && index < lines.length; index++) {
    offset += lines[index].length + 1;
  }
  return offset + character;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
