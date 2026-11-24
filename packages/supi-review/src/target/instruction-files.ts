import { readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";
import { findAncestorInstructionFiles } from "@mrclrchtr/supi-code-intelligence/instruction-files";
import { REVIEW_LIMITS } from "../review-limits.ts";
import type { ReviewChange, ReviewInput, ReviewScope, ReviewSnapshot } from "../types.ts";
import { sha256 } from "./hash.ts";

/** One instruction file embedded in full in every Reviewer Packet of a Review. */
export interface EmbeddedInstructionFile {
  /** Repository-relative POSIX path in the frozen after state. */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  /** Git name-status token when the target changes this file. */
  readonly changeStatus?: string;
  readonly content: string;
}

/** An instruction file the target deletes; its before version is reachable through Git. */
export interface DeletedInstructionFile {
  readonly path: string;
}

/** Repository instruction files selected once per Review from the frozen after state. */
export interface ReviewInstructionFiles {
  readonly files: readonly EmbeddedInstructionFile[];
  readonly deleted: readonly DeletedInstructionFile[];
}

/** Selected instruction files, or the reason the Review cannot embed them. */
export type ReviewInstructionFilesOutcome =
  | { kind: "selected"; instructionFiles: ReviewInstructionFiles }
  | { kind: "invalid"; reason: string };

function isDeletion(change: ReviewChange): boolean {
  return change.status.startsWith("D");
}

/** Directories whose ancestor chains select instruction files, as repository-relative paths. */
function selectionDirectories(
  snapshot: ReviewSnapshot,
  review: ReviewInput,
  scope: ReviewScope,
): Set<string> {
  const directories = new Set<string>(["."]);
  if (review.tasks.some((task) => task.mode === "change")) {
    for (const change of snapshot.changes) {
      directories.add(posix.dirname(change.path));
      if (change.previousPath) directories.add(posix.dirname(change.previousPath));
    }
  }
  for (const path of scope.paths ?? []) directories.add(path);
  return directories;
}

/** Nearest existing directory at or above a repository-relative path in the workspace. */
async function existingDirectory(workspaceCwd: string, path: string): Promise<string> {
  let current = path;
  for (;;) {
    const stats = await stat(join(workspaceCwd, current)).catch(() => undefined);
    if (stats?.isDirectory()) return current;
    if (current === "." || current === "") return ".";
    current = posix.dirname(current);
  }
}

/**
 * Select the workspace-root instruction file plus the nearest configured instruction file in each
 * ancestor directory of every changed path (when the batch has a change task) and every Review
 * Scope path. One selection serves every task of the Review, so their packets share it.
 * Files are read in full from the frozen Review Workspace and returned shallowest first. The
 * combined size must stay within `REVIEW_LIMITS.instructionFileBytes`; otherwise the Review fails
 * before fan-out rather than embedding a partial set.
 */
export async function selectReviewInstructionFiles(input: {
  workspaceCwd: string;
  snapshot: ReviewSnapshot;
  review: ReviewInput;
  scope: ReviewScope;
  /** Authorized instruction file names from the caller's configuration, in priority order. */
  fileNames: readonly string[];
}): Promise<ReviewInstructionFilesOutcome> {
  const { workspaceCwd, snapshot, fileNames } = input;
  const changeStatus = new Map(snapshot.changes.map((change) => [change.path, change.status]));
  const paths = new Set<string>();
  for (const directory of selectionDirectories(snapshot, input.review, input.scope)) {
    const existing = await existingDirectory(workspaceCwd, directory);
    for (const match of findAncestorInstructionFiles({
      directory: join(workspaceCwd, existing),
      cwd: workspaceCwd,
      fileNames,
    })) {
      paths.add(match.relativePath.split("\\").join("/"));
    }
  }
  const ordered = [...paths].sort(
    (left, right) =>
      left.split("/").length - right.split("/").length || left.localeCompare(right, "en"),
  );
  const files: EmbeddedInstructionFile[] = [];
  for (const path of ordered) {
    const content = await readFile(join(workspaceCwd, path), "utf8");
    const status = changeStatus.get(path);
    files.push({
      path,
      sha256: sha256(content),
      bytes: Buffer.byteLength(content, "utf8"),
      ...(status ? { changeStatus: status } : {}),
      content,
    });
  }
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total > REVIEW_LIMITS.instructionFileBytes) {
    const listed = files
      .map((file) => `${file.path} (${file.bytes.toLocaleString("en-US")} bytes)`)
      .join(", ");
    return {
      kind: "invalid",
      reason: `Repository instruction files total ${total.toLocaleString("en-US")} bytes, above the ${REVIEW_LIMITS.instructionFileBytes.toLocaleString("en-US")}-byte limit for one Review: ${listed}. Narrow the change or the Review Scope, or shorten these files.`,
    };
  }
  const names = new Set(fileNames);
  const deleted = snapshot.changes
    .filter((change) => isDeletion(change) && names.has(posix.basename(change.path)))
    .map((change) => ({ path: change.path }));
  return { kind: "selected", instructionFiles: { files, deleted } };
}
