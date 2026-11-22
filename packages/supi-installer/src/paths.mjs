import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve existing file aliases; a missing file keeps its absolute path. @param {string} path */
export function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return path;
    throw error;
  }
}

/** Match Pi's tilde and file URL path forms. @param {string} path @param {string} [home] */
export function expandPath(path, home = homedir()) {
  if (path === "~") return home;
  if (path.startsWith("~/") || (process.platform === "win32" && path.startsWith("~\\")))
    return join(home, path.slice(2));
  return path.startsWith("file://") ? fileURLToPath(path) : path;
}
