/** Filesystem and UTF-16 validation for exact point inspection. */

import { existsSync, readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import { normalizePath } from "../../analysis/search/paths.ts";
import type { InputValidation } from "../input/common.ts";
import type { SourcePointInput } from "../target-input.ts";

export interface ValidatedInspectPoint {
  readonly file: string;
  readonly relPath: string;
  readonly line: number;
  readonly character: number;
  readonly lineCount: number;
}

/** Validate a readable regular file and an in-bounds 1-based UTF-16 point. */
export function validateInspectPoint(
  point: SourcePointInput,
  cwd: string,
): InputValidation<ValidatedInspectPoint> {
  const file = normalizePath(point.file, cwd);
  if (!existsSync(file)) {
    return { kind: "invalid-input", message: `File not found: \`${point.file}\`` };
  }

  try {
    if (!statSync(file).isFile()) {
      return { kind: "invalid-input", message: `Not a regular file: \`${point.file}\`` };
    }
  } catch {
    return { kind: "invalid-input", message: `Cannot access file: \`${point.file}\`` };
  }

  let source: string;
  try {
    source = readFileSync(file, "utf-8");
  } catch {
    return { kind: "invalid-input", message: `Cannot read file: \`${point.file}\`` };
  }

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (point.line > lines.length) {
    return {
      kind: "invalid-input",
      message: `Point line ${point.line} is beyond the end of \`${point.file}\` (${lines.length} lines).`,
    };
  }

  const lineText = lines[point.line - 1] ?? "";
  const maximumCharacter = lineText.length + 1;
  if (point.character > maximumCharacter) {
    return {
      kind: "invalid-input",
      message: `Point character ${point.character} is beyond line ${point.line} of \`${point.file}\` (maximum ${maximumCharacter}, 1-based UTF-16).`,
    };
  }

  return {
    kind: "valid",
    value: {
      file,
      relPath: relative(cwd, file) || point.file,
      line: point.line,
      character: point.character,
      lineCount: lines.length,
    },
  };
}
