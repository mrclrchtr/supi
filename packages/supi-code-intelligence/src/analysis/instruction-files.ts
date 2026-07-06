// Directory-local instruction file discovery and rendering for code_orientation.

import { readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { isWithinOrEqual } from "@mrclrchtr/supi-core/project";

export const INSTRUCTION_FILE_LINE_LIMIT = 200;

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
  files: Array<Omit<RenderedInstructionFile, "content">>;
}

/**
 * Find configured instruction files for a directory focus.
 *
 * Walks from cwd to the focused directory (shallowest first, deepest last),
 * selecting the first configured file name that exists in each directory.
 */
export function findInstructionFilesForDirectory(options: {
  directory: string;
  cwd: string;
  fileNames: string[];
  nativeContextPaths: Set<string>;
  surfacedDirectories: Set<string>;
}): InstructionFileMatch[] {
  const cwd = path.resolve(options.cwd);
  const directory = path.resolve(options.directory);
  const fileNames = options.fileNames.filter((name) => name.trim().length > 0);
  if (fileNames.length === 0) return [];
  if (!isDirectoryWithinCwd(directory, cwd)) return [];

  const dirs = collectDirsShallowestFirst(directory, cwd);
  const matches: InstructionFileMatch[] = [];

  for (const dir of dirs) {
    if (options.surfacedDirectories.has(dir)) continue;
    const match = findFirstInstructionFile(dir, cwd, fileNames);
    if (!match) continue;
    if (options.nativeContextPaths.has(match.absolutePath)) continue;
    matches.push(match);
  }

  return matches;
}

function isDirectoryWithinCwd(directory: string, cwd: string): boolean {
  try {
    return statSync(directory).isDirectory() && isWithinOrEqual(cwd, directory);
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
    if (!isFile(candidate)) continue;
    return {
      absolutePath: candidate,
      relativePath: path.relative(cwd, candidate),
      directory: dir,
      relativeDirectory: path.relative(cwd, dir) || ".",
    };
  }
  return null;
}

/** Render instruction files as a markdown section and structured metadata. */
export function renderInstructionFiles(
  files: InstructionFileMatch[],
  lineLimit = INSTRUCTION_FILE_LINE_LIMIT,
): { markdown: string; metadata: InstructionFilesMetadata } | null {
  const rendered = files.map((file) => renderInstructionFile(file, lineLimit)).filter(isRendered);
  if (rendered.length === 0) return null;

  const lines: string[] = [];
  lines.push("## Instructions");
  lines.push("");
  for (const file of rendered) {
    lines.push(`### ${file.path}`);
    lines.push("");
    lines.push(file.content);
    if (file.truncated) {
      lines.push("");
      lines.push(
        `_Instruction file truncated to ${file.shownLines} of ${file.totalLines} lines. Use \`read\` on \`${file.path}\` for the full file._`,
      );
    }
    lines.push("");
  }

  return {
    markdown: lines.join("\n").trimEnd(),
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

function renderInstructionFile(
  file: InstructionFileMatch,
  lineLimit: number,
): RenderedInstructionFile | null {
  try {
    const content = readFileSync(file.absolutePath, "utf-8").trim();
    if (!content) return null;

    const lines = content.split("\n");
    const shown = lines.slice(0, lineLimit);
    return {
      path: file.relativePath,
      directory: file.relativeDirectory,
      shownLines: shown.length,
      totalLines: lines.length,
      truncated: lines.length > shown.length,
      content: shown.join("\n"),
    };
  } catch {
    return null;
  }
}

function isRendered(value: RenderedInstructionFile | null): value is RenderedInstructionFile {
  return value !== null;
}

/** Insert instruction markdown after the opening title/summary block of a brief. */
export function insertInstructionsNearTop(content: string, instructionsMarkdown: string): string {
  const lines = content.split("\n");
  const insertAt = findFirstSectionIndexAfterTitle(lines);
  const before = lines.slice(0, insertAt).join("\n").trimEnd();
  const after = lines.slice(insertAt).join("\n").trimStart();

  if (!before) return `${instructionsMarkdown}\n\n${after}`.trimEnd();
  if (!after) return `${before}\n\n${instructionsMarkdown}`.trimEnd();
  return `${before}\n\n${instructionsMarkdown}\n\n${after}`.trimEnd();
}

function findFirstSectionIndexAfterTitle(lines: string[]): number {
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) return i;
  }
  return lines.length;
}
