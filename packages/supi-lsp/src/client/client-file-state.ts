import { accessSync, constants, statSync } from "node:fs";

/** State used to distinguish deleted files from files that cannot be read. */
export type DiagnosticFileState = "present" | "removed" | "unreadable";

/** Read the file-system state without treating access errors as deletion. */
export function getDiagnosticFileState(filePath: string): DiagnosticFileState {
  try {
    if (!statSync(filePath).isFile()) return "unreadable";
    accessSync(filePath, constants.R_OK);
    return "present";
  } catch (error) {
    return isMissingFileError(error) ? "removed" : "unreadable";
  }
}

/** Identify file-system errors that prove that a tracked path is missing. */
export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
