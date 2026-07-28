import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

/**
 * Convert a file path to a file:// URI.
 *
 * Uses Node's `pathToFileURL` to produce a standards-compliant URI with
 * proper percent-encoding of spaces, hashes, and other special characters.
 */
export function fileToUri(filePath: string): string {
  return pathToFileURL(filePath).href;
}

/**
 * Convert a file:// URI to a file path.
 *
 * Uses Node's `fileURLToPath` for standards-compliant decoding. Non-file
 * URIs are passed through unchanged so consumers (such as LSP diagnostic
 * handling) remain compatible with non-file URI schemes.
 */
export function uriToFile(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
}
