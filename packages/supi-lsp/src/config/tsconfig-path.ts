import * as path from "node:path";
import ts from "typescript";

/** Normalize a path for tsconfig cache keys and comparisons. */
export function normalizeTsconfigPath(target: string): string {
  const resolved = path.resolve(target).replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
}
