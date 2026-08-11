import { posix, relative, resolve, sep, win32 } from "node:path";

/** Verified repository-relative review path that cannot lexically escape the worktree. */
export interface SafeReviewPath {
  absolute: string;
  path: string;
}

/** Strip PI's model-facing path sigil before repository-relative validation. */
export function normalizeReviewPathArgument(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path;
}

/** Normalize a portable repository-relative path without touching the filesystem. */
export function normalizeRepositoryRelativePath(path: string): string {
  if (!path || path.includes("\0") || posix.isAbsolute(path) || win32.isAbsolute(path)) {
    throw new Error(`Review path must stay inside the repository: ${path}`);
  }
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Review path must stay inside the repository: ${path}`);
  }
  return normalized;
}

/**
 * Resolve a normalized repository-relative path without lexical escape.
 *
 * Model-facing callers must remove PI's `@` path sigil first.
 */
export function resolveReviewPath(cwd: string, path: string): SafeReviewPath {
  const normalizedInput = normalizeRepositoryRelativePath(path);
  const absolute = resolve(cwd, normalizedInput);
  const normalized = relative(resolve(cwd), absolute);
  if (!normalized || normalized === ".." || normalized.startsWith(`..${sep}`)) {
    throw new Error(`Review path must stay inside the repository: ${path}`);
  }
  return { absolute, path: normalized.split(sep).join("/") };
}
