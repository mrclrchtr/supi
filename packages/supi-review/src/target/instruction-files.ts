import { readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";
import { findAncestorInstructionFiles } from "@mrclrchtr/supi-code-intelligence/instruction-files";
import { REVIEW_LIMITS } from "../review-limits.ts";
import type { ReviewChange, ReviewInput, ReviewScope, ReviewSnapshot } from "../types.ts";
import { sha256 } from "./hash.ts";

/** Facts shared by embedded and indexed instruction files. */
interface InstructionFileFacts {
  /** Repository-relative POSIX path in the frozen after state. */
  readonly path: string;
  readonly sha256: string;
  readonly lines: number;
  /** Git name-status token when the target changes this file. */
  readonly changeStatus?: string;
}

/** The workspace-root instruction file, embedded in full in every Reviewer Packet. */
export interface EmbeddedInstructionFile extends InstructionFileFacts {
  readonly bytes: number;
  readonly content: string;
}

/** A package instruction file named in the packet index but not embedded. */
export interface IndexedInstructionFile extends InstructionFileFacts {
  /** Changed paths inside this file's directory. */
  readonly coveredChangedPaths: number;
  /** Review Scope paths inside this file's directory. */
  readonly coveredScopePaths: readonly string[];
}

/** An instruction file the target deletes; its before version is reachable through Git. */
export interface DeletedInstructionFile {
  readonly path: string;
}

/** Repository instruction files selected once per Review from the frozen after state. */
export interface ReviewInstructionFiles {
  /** The workspace-root file, when one exists. */
  readonly root?: EmbeddedInstructionFile;
  /** Deeper files on changed or Review Scope paths, shallowest first. */
  readonly indexed: readonly IndexedInstructionFile[];
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

function lineCount(content: string): number {
  const trimmed = content.endsWith("\n") ? content.slice(0, -1) : content;
  return trimmed ? trimmed.split("\n").length : 0;
}

function isWithin(directory: string, path: string): boolean {
  return directory === "." || path === directory || path.startsWith(`${directory}/`);
}

/**
 * Select the workspace-root instruction file plus the nearest configured instruction file in each
 * ancestor directory of every changed path (when the batch has a change task) and every Review
 * Scope path. One selection serves every task of the Review. Only the root file is embedded; it
 * must stay within `REVIEW_LIMITS.instructionFileBytes`, otherwise the Review fails before fan-out.
 * Deeper files are indexed with the changed and Review Scope paths they cover.
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
  const hasChangeTask = input.review.tasks.some((task) => task.mode === "change");
  const changedPaths = hasChangeTask ? snapshot.changes.map((change) => change.path) : [];
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
  let root: EmbeddedInstructionFile | undefined;
  const indexed: IndexedInstructionFile[] = [];
  for (const path of ordered) {
    const content = await readFile(join(workspaceCwd, path), "utf8");
    const status = changeStatus.get(path);
    const facts = {
      path,
      sha256: sha256(content),
      lines: lineCount(content),
      ...(status ? { changeStatus: status } : {}),
    };
    const directory = posix.dirname(path);
    if (directory === ".") {
      root = { ...facts, bytes: Buffer.byteLength(content, "utf8"), content };
      continue;
    }
    indexed.push({
      ...facts,
      coveredChangedPaths: changedPaths.filter((changed) => isWithin(directory, changed)).length,
      coveredScopePaths: (input.scope.paths ?? []).filter((scoped) => isWithin(directory, scoped)),
    });
  }
  if (root && root.bytes > REVIEW_LIMITS.instructionFileBytes) {
    return {
      kind: "invalid",
      reason: `Root instruction file ${root.path} has ${root.bytes.toLocaleString("en-US")} bytes, above the ${REVIEW_LIMITS.instructionFileBytes.toLocaleString("en-US")}-byte limit for embedding it in a Reviewer Packet. Shorten it, or move package-specific rules into package instruction files.`,
    };
  }
  const names = new Set(fileNames);
  const deleted = snapshot.changes
    .filter((change) => isDeletion(change) && names.has(posix.basename(change.path)))
    .map((change) => ({ path: change.path }));
  return {
    kind: "selected",
    instructionFiles: { ...(root ? { root } : {}), indexed, deleted },
  };
}
