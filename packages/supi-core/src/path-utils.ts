import * as path from "node:path";

/** Strip pi's optional leading `@` file-path prefix from a tool input. */
export function stripToolPathPrefix(target: string): string {
  return target.startsWith("@") ? target.slice(1) : target;
}

/**
 * Resolve a tool-style file path from a session cwd.
 *
 * Built-in pi file tools accept a leading `@` prefix in path arguments, so
 * shared SuPi path helpers normalize that prefix before resolving relative
 * paths.
 */
export function resolveToolPath(cwd: string, target: string): string {
  return path.resolve(cwd, stripToolPathPrefix(target));
}

/** Convert a file path to a file:// URI. */
export function fileToUri(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (process.platform === "win32") {
    return `file:///${resolved.replace(/\\/g, "/")}`;
  }
  return `file://${resolved}`;
}

/** Convert a file:// URI to a file path. */
export function uriToFile(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  let filePath = decodeURIComponent(uri.slice(7));
  if (
    process.platform === "win32" &&
    filePath.startsWith("/") &&
    /^[A-Za-z]:/.test(filePath.slice(1))
  ) {
    filePath = filePath.slice(1);
  }
  return filePath;
}
