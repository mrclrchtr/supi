/**
 * Shared validation primitives for tool families.
 */

/** Validates that a file path exists and is accessible. */
export function validateFilePath(file: string, _cwd: string): string | null {
  if (!file || file.trim().length === 0) {
    return "File path is required.";
  }
  return null;
}

/** Validates that anchored coordinates include file, line, and character. */
export function validateAnchoredParams(params: {
  file?: string;
  line?: number;
  character?: number;
}): string | null {
  if (!params.file && (params.line != null || params.character != null)) {
    return "When providing line/character, file is required.";
  }
  if (params.file && (params.line == null || params.character == null)) {
    return "When providing file, line and character are also required for anchored resolution.";
  }
  return null;
}
