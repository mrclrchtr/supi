import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import { dirname, posix, relative, resolve, sep, win32 } from "node:path";

export interface SafeReviewPath {
  absolute: string;
  path: string;
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

/** Resolve a repository-relative tool path without allowing lexical escape. */
export function resolveReviewPath(cwd: string, path: string): SafeReviewPath {
  const normalizedInput = normalizeRepositoryRelativePath(path);
  const absolute = resolve(cwd, normalizedInput);
  const normalized = relative(resolve(cwd), absolute);
  if (!normalized || normalized === ".." || normalized.startsWith(`..${sep}`)) {
    throw new Error(`Review path must stay inside the repository: ${path}`);
  }
  return { absolute, path: normalized.split(sep).join("/") };
}

function isMissingPath(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    ((error as { code?: unknown }).code === "ENOENT" ||
      (error as { code?: unknown }).code === "ENOTDIR")
  );
}

function assertInsideRepository(repository: string, candidate: string, originalPath: string): void {
  const rel = relative(repository, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`Review path must stay inside the repository: ${originalPath}`);
  }
}

/** Read a working-tree file without following an intermediate symlink outside the repository. */
export async function readWorkingTreeFile(cwd: string, path: string): Promise<string | undefined> {
  const safe = resolveReviewPath(cwd, path);
  try {
    const [repository, parent, stat] = await Promise.all([
      realpath(cwd),
      realpath(dirname(safe.absolute)),
      lstat(safe.absolute),
    ]);
    assertInsideRepository(repository, parent, path);
    if (stat.isSymbolicLink()) return await readlink(safe.absolute);
    if (!stat.isFile()) return undefined;
    const resolvedFile = await realpath(safe.absolute);
    assertInsideRepository(repository, resolvedFile, path);
    return await readFile(safe.absolute, "utf8");
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
}

/** Remove deleted paths from a Git-produced repository-relative path list. */
export async function filterExistingReviewPaths(cwd: string, paths: string[]): Promise<string[]> {
  const existing = await Promise.all(
    paths.map(async (path) => {
      try {
        await lstat(resolveReviewPath(cwd, path).absolute);
        return path;
      } catch (error) {
        if (isMissingPath(error)) return undefined;
        throw error;
      }
    }),
  );
  return existing.filter((path): path is string => path !== undefined);
}
