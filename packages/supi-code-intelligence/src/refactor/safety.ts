/**
 * Edit validation safety checks for the code_refactor apply path.
 *
 * Rejects empty edits, invalid ranges, and out-of-bounds changes
 * before they reach the filesystem.
 */

import { readFileSync } from "node:fs";
import type { FileEdit, WorkspaceEdit } from "@mrclrchtr/supi-code-runtime/api";

export type ValidationResult = { safe: true } | { safe: false; reason: string };

/**
 * Validate a WorkspaceEdit before applying it.
 *
 * Rejects:
 * - empty edit sets
 * - edits with negative line/character ranges
 * - edits with end position before start position
 * - overlapping edits on the same file
 */
export function validateEdit(edit: WorkspaceEdit): ValidationResult {
  if (!edit.edits || edit.edits.length === 0) {
    return { safe: false, reason: "Edit set is empty" };
  }

  for (const fe of edit.edits) {
    if (fe.range.start.line < 0 || fe.range.end.line < 0) {
      return { safe: false, reason: `Invalid range in edit for file "${fe.file}": negative line` };
    }
    if (fe.range.start.character < 0 || fe.range.end.character < 0) {
      return {
        safe: false,
        reason: `Invalid range in edit for file "${fe.file}": negative character`,
      };
    }

    if (
      fe.range.end.line < fe.range.start.line ||
      (fe.range.end.line === fe.range.start.line &&
        fe.range.end.character < fe.range.start.character)
    ) {
      return { safe: false, reason: `Edit for file "${fe.file}" has end before start` };
    }
  }

  if (hasOverlappingEdits(edit.edits)) {
    return { safe: false, reason: "Overlapping edits in one or more files" };
  }

  return { safe: true };
}

/**
 * Validate edit ranges against the current file contents.
 *
 * Rejects:
 * - unreadable files
 * - line indices beyond file length
 * - character indices beyond the referenced line length
 */
export function validateEditAgainstFiles(edit: WorkspaceEdit): ValidationResult {
  const baseValidation = validateEdit(edit);
  if (!baseValidation.safe) return baseValidation;

  const grouped = groupByFile(edit.edits);
  for (const [file, fileEdits] of grouped) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch (error) {
      return {
        safe: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    const lines = content.split("\n");
    for (const fileEdit of fileEdits) {
      const lineValidation = validateLineBounds(file, fileEdit, lines);
      if (!lineValidation.safe) return lineValidation;

      const characterValidation = validateCharacterBounds(file, fileEdit, lines);
      if (!characterValidation.safe) return characterValidation;
    }
  }

  return { safe: true };
}

function validateLineBounds(file: string, edit: FileEdit, lines: string[]): ValidationResult {
  const maxLine = lines.length - 1;
  if (edit.range.start.line > maxLine || edit.range.end.line > maxLine) {
    return {
      safe: false,
      reason: `Edit in file "${file}" references line ${Math.max(edit.range.start.line, edit.range.end.line)}, but the file has only ${lines.length} line${lines.length === 1 ? "" : "s"}`,
    };
  }
  return { safe: true };
}

function validateCharacterBounds(file: string, edit: FileEdit, lines: string[]): ValidationResult {
  const startLineLength = lines[edit.range.start.line]?.length ?? 0;
  if (edit.range.start.character > startLineLength) {
    return {
      safe: false,
      reason: `Edit in file "${file}" references character ${edit.range.start.character} on line ${edit.range.start.line}, but that line is only ${startLineLength} character${startLineLength === 1 ? "" : "s"} long`,
    };
  }

  const endLineLength = lines[edit.range.end.line]?.length ?? 0;
  if (edit.range.end.character > endLineLength) {
    return {
      safe: false,
      reason: `Edit in file "${file}" references character ${edit.range.end.character} on line ${edit.range.end.line}, but that line is only ${endLineLength} character${endLineLength === 1 ? "" : "s"} long`,
    };
  }

  return { safe: true };
}

function hasOverlappingEdits(edits: FileEdit[]): boolean {
  const fileGroups = groupByFile(edits);
  for (const [, fileEdits] of fileGroups) {
    const sorted = [...fileEdits].sort(
      (a, b) =>
        absoluteOffset(a.range.start.line, a.range.start.character) -
        absoluteOffset(b.range.start.line, b.range.start.character),
    );

    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const previousEnd = absoluteOffset(previous.range.end.line, previous.range.end.character);
      const currentStart = absoluteOffset(current.range.start.line, current.range.start.character);
      if (currentStart < previousEnd) return true;
    }
  }
  return false;
}

function absoluteOffset(line: number, character: number): number {
  return line * 1_000_000 + character;
}

function groupByFile(edits: FileEdit[]): Map<string, FileEdit[]> {
  const groups = new Map<string, FileEdit[]>();
  for (const fileEdit of edits) {
    const group = groups.get(fileEdit.file) ?? [];
    group.push(fileEdit);
    groups.set(fileEdit.file, group);
  }
  return groups;
}
