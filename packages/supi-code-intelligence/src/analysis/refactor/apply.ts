/**
 * Direct-apply file mutation path for precise workspace edits.
 *
 * Stages transformed content beside each source file before atomically
 * replacing that file. A failed stage cannot truncate a source file, and a
 * failed later replacement attempts to roll back files already replaced.
 *
 * Edits are sorted by descending source position
 * so edits are applied from bottom-right to top-left regardless of order.
 *
 * Only called after safety validation has passed.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import type { FileEdit, WorkspaceEdit } from "@mrclrchtr/supi-code-runtime/api";
import { compareCodePositions } from "./position.ts";
import { validateEditAgainstFiles } from "./safety.ts";

export type ApplyResult =
  | { kind: "applied"; filesChanged: number; totalEdits: number }
  | { kind: "error"; reason: string };

export interface ApplyOptions {
  /** Expected SHA-256 fingerprints per file, validated after queue acquisition. */
  expectedFingerprints?: ReadonlyMap<string, string>;
}

/**
 * Apply a validated WorkspaceEdit to the filesystem.
 *
 * Precomputes every file's new content in memory first, then commits
 * all writes. If a commit fails after some files were already replaced,
 * the function attempts to roll those files back to their original contents.
 *
 * When `expectedFingerprints` is supplied, fingerprints are compared
 * **after** all mutation queues are acquired, so a sibling write cannot
 * change the file between fingerprint check and queue entry.
 *
 * The whole precompute-then-commit (including range/safety re-checks) runs
 * inside pi's per-file mutation queue, acquired for every involved file in
 * sorted path order before reading. This serializes against sibling
 * `edit`/`write` tools on the same file and prevents lock-ordering deadlock
 * across concurrent applies, while attempting to roll back ordinary commit
 * failures across files (ADR 0006). It does not provide durable crash recovery
 * across sequential replacements.
 */
export async function applyWorkspaceEdit(
  edit: WorkspaceEdit,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const grouped = groupEditsByFile(edit.edits);
  const files = [...grouped.keys()].sort();
  return withAllMutationQueues(files, async () => {
    if (options.expectedFingerprints) {
      const freshness = validateFingerprints(files, options.expectedFingerprints);
      if (!freshness.ok) return { kind: "error", reason: freshness.reason };
    }

    const validation = validateEditAgainstFiles(edit);
    if (!validation.safe) {
      return { kind: "error", reason: validation.reason };
    }

    const originalContents = readOriginalContents(grouped);
    if (originalContents.kind === "error") return originalContents;

    const transformedContents = buildTransformedContents(grouped, originalContents.contents);
    return commitTransformedContents(
      transformedContents,
      originalContents.contents,
      edit.edits.length,
    );
  });
}

function validateFingerprints(
  files: string[],
  expected: ReadonlyMap<string, string>,
): { ok: true } | { ok: false; reason: string } {
  for (const file of files) {
    const expectedFingerprint = expected.get(file);
    if (expectedFingerprint === undefined) continue;
    let actual: string;
    try {
      actual = sha256File(file);
    } catch {
      return stalePlanError(file);
    }
    if (actual !== expectedFingerprint) return stalePlanError(file);
  }
  return { ok: true };
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file, "utf-8")).digest("hex");
}

function stalePlanError(file: string): { ok: false; reason: string } {
  return {
    ok: false,
    reason: `File ${file} has changed since the plan was generated. Regenerate with code_refactor_plan.`,
  };
}

/**
 * Acquire pi's per-file mutation queue for every involved file in sorted path
 * order before running `fn`, holding all locks for the duration. Sorted order
 * prevents lock-ordering deadlock across concurrent applies; per-file queues
 * serialize against sibling `edit`/`write` tools on the same file (ADR 0006).
 */
async function withAllMutationQueues<T>(files: string[], fn: () => Promise<T>): Promise<T> {
  if (files.length === 0) return fn();
  const [head, ...rest] = files;
  return withFileMutationQueue(head, () => withAllMutationQueues(rest, fn));
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
      // Descending by start position so later edits don't shift earlier ones.
      compareCodePositions(right.range.start, left.range.start) ||
      compareCodePositions(right.range.end, left.range.end),
  );

  let updated = content;
  for (const fileEdit of sortedEdits) {
    const startOffset = toOffset(lines, fileEdit.range.start.line, fileEdit.range.start.character);
    const endOffset = toOffset(lines, fileEdit.range.end.line, fileEdit.range.end.character);
    updated = updated.slice(0, startOffset) + fileEdit.newText + updated.slice(endOffset);
  }

  return updated;
}

interface StagedContents {
  kind: "staged";
  files: Map<string, string>;
}

type StageResult = StagedContents | { kind: "error"; reason: string };

function commitTransformedContents(
  transformedContents: Map<string, string>,
  originalContents: Map<string, string>,
  totalEdits: number,
): ApplyResult {
  const staged = stageTransformedContents(transformedContents);
  if (staged.kind === "error") return staged;

  const committedFiles: string[] = [];
  try {
    // ponytail: no durable journal; add one only if cross-file crash recovery is required.
    for (const [file, stagedFile] of [...staged.files].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      renameSync(stagedFile, file);
      committedFiles.push(file);
    }
  } catch (error) {
    const rollbackError = rollbackCommittedFiles(committedFiles, originalContents);
    return {
      kind: "error",
      reason: rollbackError
        ? `${toErrorMessage(error)} (rollback failed: ${rollbackError})`
        : toErrorMessage(error),
    };
  } finally {
    cleanupStagedFiles(staged.files);
  }

  return {
    kind: "applied",
    filesChanged: transformedContents.size,
    totalEdits,
  };
}

function stageTransformedContents(transformedContents: Map<string, string>): StageResult {
  const stagedFiles = new Map<string, string>();
  try {
    for (const [file, content] of transformedContents) {
      const stagedFile = stagedFilePath(file);
      stagedFiles.set(file, stagedFile);
      writeFileSync(stagedFile, content, {
        encoding: "utf-8",
        flag: "wx",
        mode: statSync(file).mode & 0o777,
      });
    }
    return { kind: "staged", files: stagedFiles };
  } catch (error) {
    cleanupStagedFiles(stagedFiles);
    return { kind: "error", reason: toErrorMessage(error) };
  }
}

function stagedFilePath(file: string): string {
  return join(dirname(file), `.${basename(file)}.supi-refactor-${randomUUID()}.tmp`);
}

function cleanupStagedFiles(stagedFiles: ReadonlyMap<string, string>): void {
  for (const stagedFile of stagedFiles.values()) {
    try {
      rmSync(stagedFile, { force: true });
    } catch {
      // Staging cleanup is best-effort; source files have already been preserved or restored.
    }
  }
}

function rollbackCommittedFiles(
  committedFiles: string[],
  originalContents: Map<string, string>,
): string | null {
  try {
    for (const file of committedFiles.reverse()) {
      writeFileSync(file, originalContents.get(file) ?? "", "utf-8");
    }
    return null;
  } catch (error) {
    return toErrorMessage(error);
  }
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
