import * as path from "node:path";
import { getTypeScript } from "./typescript-module.ts";

/** Normalize a path for tsconfig cache keys and comparisons. */
export function normalizeTsconfigPath(target: string): string {
  const resolved = path.resolve(target).replaceAll("\\", "/");
  return getTypeScript().sys.useCaseSensitiveFileNames ? resolved : resolved.toLowerCase();
}
