// Directory-local instruction file discovery and rendering for code_orientation.

import { readFileSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";

/** Directory-local instruction file selected for orientation output. */
export interface InstructionFileMatch {
  /** Absolute file path. */
  absolutePath: string;
  /** Workspace-relative file path. */
  relativePath: string;
  /** Absolute containing directory. */
  directory: string;
  /** Workspace-relative containing directory. */
  relativeDirectory: string;
}

/** Agent-visible instruction file snippet plus metadata for details. */
export interface RenderedInstructionFile {
  path: string;
  directory: string;
  shownLines: number;
  totalLines: number;
  truncated: boolean;
  content: string;
}

/** Structured metadata stored in code_orientation details. */
export interface InstructionFilesMetadata {
  files: Array<
    Omit<RenderedInstructionFile, "content"> & {
      /**
       * The file was cut because it alone exceeds the tool output limit. It counts as surfaced
       * after one delivery, since no later Orientation can show it in full.
       */
      exceedsOutputLimit?: boolean;
    }
  >;
}

/**
 * Validate that a configured instruction file name is a plain filename
 * with no directory components. Rejects names that would allow path traversal.
 */
export function isValidInstructionFileName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed !== name) return false;
  if (trimmed !== path.basename(trimmed)) return false;
  if (trimmed === "." || trimmed === "..") return false;
  return true;
}

/**
 * Find configured instruction files for a directory focus.
 *
 * Walks from cwd to the focused directory (shallowest first, deepest last),
 * selecting the first valid configured file name that exists in each directory.
 * Each configured name is validated as a plain filename; resolved candidates
 * are verified via realpath to remain within the workspace root.
 *
 * When the project is not trusted, all project-configured instruction files
 * are rejected so a repository-authored path cannot cause reads outside the
 * workspace root.
 *
 * `known` lists files the session already has (loaded natively, read in full, or
 * delivered by an earlier orientation), so callers can say why they are not repeated.
 */
export function findInstructionFilesForDirectory(options: {
  directory: string;
  cwd: string;
  fileNames: string[];
  nativeContextPaths: Set<string>;
  surfacedDirectories: Set<string>;
  /** Whether project-local configuration is trusted. */
  projectTrusted: boolean;
}): { matches: InstructionFileMatch[]; known: InstructionFileMatch[] } {
  const cwd = path.resolve(options.cwd);
  const directory = path.resolve(options.directory);

  const validNames =
    options.projectTrusted && Array.isArray(options.fileNames)
      ? options.fileNames.filter(isValidInstructionFileName)
      : [];
  if (validNames.length === 0) return { matches: [], known: [] };
  if (!isDirectoryWithinCwd(directory, cwd)) return { matches: [], known: [] };

  const dirs = collectDirsShallowestFirst(directory, cwd);
  const matches: InstructionFileMatch[] = [];
  const known: InstructionFileMatch[] = [];

  for (const dir of dirs) {
    const match = findFirstInstructionFile(dir, cwd, validNames);
    if (!match) continue;
    const seen =
      options.surfacedDirectories.has(dir) || options.nativeContextPaths.has(match.absolutePath);
    (seen ? known : matches).push(match);
  }

  return { matches, known };
}

/**
 * Find the nearest configured instruction file in each directory from `cwd` down to `directory`,
 * shallowest first. Unlike {@link findInstructionFilesForDirectory} this applies no trust or
 * session-dedup policy: the caller supplies an already-authorized name list. Invalid names and
 * candidates whose real path leaves `cwd` are skipped.
 */
export function findAncestorInstructionFiles(options: {
  directory: string;
  cwd: string;
  fileNames: readonly string[];
}): InstructionFileMatch[] {
  const cwd = path.resolve(options.cwd);
  const directory = path.resolve(options.directory);
  const validNames = options.fileNames.filter(isValidInstructionFileName);
  if (validNames.length === 0 || !isDirectoryWithinCwd(directory, cwd)) return [];
  const matches: InstructionFileMatch[] = [];
  for (const dir of collectDirsShallowestFirst(directory, cwd)) {
    const match = findFirstInstructionFile(dir, cwd, validNames);
    if (match) matches.push(match);
  }
  return matches;
}

function isDirectoryWithinCwd(directory: string, cwd: string): boolean {
  try {
    const realCwd = path.resolve(realpathSync(cwd));
    const realDirectory = path.resolve(realpathSync(directory));
    return statSync(realDirectory).isDirectory() && isWithinOrEqual(realCwd, realDirectory);
  } catch {
    return false;
  }
}

function collectDirsShallowestFirst(directory: string, cwd: string): string[] {
  const dirs: string[] = [];
  let current = directory;

  while (isWithinOrEqual(cwd, current)) {
    dirs.push(current);
    if (current === cwd) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return dirs.reverse();
}

function findFirstInstructionFile(
  dir: string,
  cwd: string,
  fileNames: string[],
): InstructionFileMatch | null {
  for (const fileName of fileNames) {
    const candidate = path.join(dir, fileName);

    // Resolve the candidate to its real path to defuse symlinks that
    // may point outside the workspace.
    let realCandidate: string;
    try {
      realCandidate = path.resolve(realpathSync(candidate));
    } catch {
      continue;
    }
    if (!isFile(realCandidate)) continue;

    // Verify containment: both the workspace root and the candidate must
    // be resolved consistently so symlinks in temp directories (e.g. macOS
    // /var → /private/var) don't break containment.
    let realCwd: string;
    try {
      realCwd = path.resolve(realpathSync(cwd));
    } catch {
      continue;
    }
    if (!isWithinOrEqual(realCwd, realCandidate)) continue;

    return {
      absolutePath: realCandidate,
      relativePath: path.relative(cwd, candidate),
      directory: dir,
      relativeDirectory: path.relative(cwd, dir) || ".",
    };
  }
  return null;
}

/**
 * Read complete instruction-file facts for session-owned Orientation. Files are not cut here:
 * the tool output limit is applied once to the whole Orientation result, see
 * `fitWorkspaceInstructions`.
 */
export function collectInstructionFiles(
  files: InstructionFileMatch[],
): { files: RenderedInstructionFile[]; metadata: InstructionFilesMetadata } | null {
  const rendered = files.map(renderInstructionFile).filter(isRendered);
  if (rendered.length === 0) return null;
  return {
    files: rendered,
    metadata: {
      files: rendered.map(({ content: _content, ...metadata }) => metadata),
    },
  };
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function renderInstructionFile(file: InstructionFileMatch): RenderedInstructionFile | null {
  try {
    const content = readFileSync(file.absolutePath, "utf-8").trim();
    if (!content) return null;

    const totalLines = content.split("\n").length;
    return {
      path: file.relativePath,
      directory: file.relativeDirectory,
      shownLines: totalLines,
      totalLines,
      truncated: false,
      content,
    };
  } catch {
    return null;
  }
}

function isRendered(value: RenderedInstructionFile | null): value is RenderedInstructionFile {
  return value !== null;
}
