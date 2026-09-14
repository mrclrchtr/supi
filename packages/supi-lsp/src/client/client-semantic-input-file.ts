import { readFile } from "node:fs/promises";

/** Internal file-read seam for one semantic input synchronization pass. */
export type SemanticInputFileReader = (filePath: string, signal: AbortSignal) => Promise<string>;

/** Default full-content reader used by the semantic input barrier. */
export const defaultSemanticInputFileReader: SemanticInputFileReader = (filePath, signal) =>
  readFile(filePath, { encoding: "utf8", signal });

/** Return whether a failed read means that the document no longer exists. */
export function isMissingFileReadError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = error.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
