import { accessSync, constants, statSync } from "node:fs";
import { type DiskStamp, toDiskStamp } from "./client-disk-stamp.ts";

/** State used to distinguish deleted files from files that cannot be read. */
export type DiagnosticFileState = "present" | "removed" | "unreadable";

/** File-system state plus the disk stamp of a present file. */
export interface DiagnosticFileStatus {
  readonly state: DiagnosticFileState;
  /** Set only for a present file. */
  readonly stamp?: DiskStamp;
}

/** Read the file-system state without treating access errors as deletion. */
export function getDiagnosticFileState(filePath: string): DiagnosticFileState {
  return getDiagnosticFileStatus(filePath).state;
}

/** Read the file-system state and, for a present file, its disk stamp. */
export function getDiagnosticFileStatus(filePath: string): DiagnosticFileStatus {
  try {
    const stats = statSync(filePath, { bigint: true });
    if (!stats.isFile()) return { state: "unreadable" };
    accessSync(filePath, constants.R_OK);
    return { state: "present", stamp: toDiskStamp(stats) };
  } catch (error) {
    return { state: isMissingFileError(error) ? "removed" : "unreadable" };
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
