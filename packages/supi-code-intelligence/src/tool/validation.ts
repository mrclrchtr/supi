import * as fs from "node:fs";
import type { CodeQueryParams } from "../query-params.ts";
import { normalizePath } from "../search-helpers.ts";

const STRUCTURED_PATTERN_KINDS = new Set(["definition", "export", "import"]);

/** Shared validation for focused tool inputs that can anchor into files. */
export function validateFocusedToolParams(
  params: Pick<CodeQueryParams, "path" | "file" | "line" | "character">,
  cwd: string,
): string | null {
  if (params.path && (params.line != null || params.character != null)) {
    return "**Error:** `line` and `character` require `file`, not `path`. Use `path` to scope/focus; use `file` to anchor a position.";
  }

  if (params.file) {
    const resolvedFile = normalizePath(params.file, cwd);
    if (fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isDirectory()) {
      return "**Error:** `file` points to a directory. Use `path` to scope a directory; use `file` to anchor a position in a file.";
    }
  }

  if ((params.line != null || params.character != null) && !params.file) {
    return "**Error:** `line` and `character` require `file`.";
  }

  return null;
}

/** Shared validation for explicit pattern-tool input. */
export function validatePatternToolParams(
  params: Pick<CodeQueryParams, "path" | "file" | "line" | "character" | "kind">,
  cwd: string,
): string | null {
  const commonError = validateFocusedToolParams(params, cwd);
  if (commonError) return commonError;

  if (params.kind && !STRUCTURED_PATTERN_KINDS.has(params.kind)) {
    return "**Error:** `code_pattern` `kind` must be one of `definition`, `export`, or `import`.";
  }

  return null;
}
