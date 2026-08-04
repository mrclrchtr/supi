import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/** Resolve a path through symlinks when possible, retaining a usable fallback. */
export function realpathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
