import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Return every regular file below a directory in deterministic path order. */
export function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walkFiles(path);
      return entry.isFile() ? [path] : [];
    })
    .sort();
}
