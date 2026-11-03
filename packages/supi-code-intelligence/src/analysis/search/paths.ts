import { existsSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { resolveToolPath, uriToFile } from "@mrclrchtr/supi-core/path";

/** Check whether a path is within the project rather than a dependency store. */
export function isInProjectPath(filePath: string, cwd: string): boolean {
  const relativePath = path.relative(cwd, path.resolve(cwd, filePath));
  if (relativePath.startsWith(`..${path.sep}`) || relativePath === "..") return false;
  const normalized = relativePath.replaceAll("\\", "/");
  return !(
    normalized.includes("/node_modules/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/.pnpm/") ||
    normalized.startsWith(".pnpm/")
  );
}

export type ScopeResolution = { kind: "ok"; path: string } | { kind: "error"; reason: string };

export type ScopeSetResolution =
  | { kind: "ok"; paths: string[]; display: string | null }
  | { kind: "error"; reason: string };

/** Resolve one optional scope path without widening a missing path to cwd. */
export function resolveScope(scope: string | undefined, cwd: string): ScopeResolution {
  if (!scope) return { kind: "ok", path: cwd };
  if (/[,;\s]/.test(scope)) {
    return {
      kind: "error",
      reason: `Scope accepts a single directory or file path, not multiple: \`${scope}\``,
    };
  }
  return resolveSingleScope(scope, cwd);
}

/** Resolve and canonicalize the labels of a code_find Scope set. */
export function resolveScopeSet(
  scope: readonly string[] | undefined,
  cwd: string,
): ScopeSetResolution {
  if (scope === undefined) return { kind: "ok", paths: [cwd], display: null };
  if (scope.length === 0) {
    return { kind: "error", reason: "Scope must include at least one directory or file path." };
  }

  const byPath = new Map<string, string>();
  for (const label of scope) {
    const trimmed = label.trim();
    if (!trimmed) {
      return { kind: "error", reason: "Scope must not include empty path entries." };
    }
    const single = resolveSingleScope(trimmed, cwd);
    if (single.kind === "error") return single;
    if (!byPath.has(single.path)) byPath.set(single.path, trimmed);
  }

  const paths = [...byPath.keys()];
  return {
    kind: "ok",
    paths,
    display: paths.map((resolved) => toDisplayPath(cwd, resolved)).join(", "),
  };
}

function resolveSingleScope(scope: string, cwd: string): ScopeResolution {
  const resolved = normalizePath(scope, cwd);
  if (!existsSync(resolved)) return { kind: "error", reason: `Scope path not found: \`${scope}\`` };
  return { kind: "ok", path: resolved };
}

/** Normalize a PI tool path by stripping a leading @ and resolving from cwd. */
export function normalizePath(input: string, cwd: string): string {
  return resolveToolPath(cwd, input);
}

/** Render filesystem locations canonically; preserve virtual provider URIs without inventing files. */
export function relativeDisplayPath(basePath: string, filePath: string, samePath = "."): string {
  if (isNonFileUri(filePath)) return filePath;
  const base = canonicalDisplayPath(path.resolve(basePath));
  const file = canonicalDisplayPath(path.resolve(basePath, uriToFile(filePath)));
  const relativePath = path.relative(base, file);
  if (!relativePath || relativePath === ".") return samePath;
  if (relativePath.startsWith(`..${path.sep}`) || relativePath === "..") return file;
  return relativePath.replaceAll("\\", "/");
}

/** Identify provider URIs that cannot be navigated as local filesystem paths. */
export function isNonFileUri(value: string): boolean {
  return !path.isAbsolute(value) && /^[a-z][a-z\d+.-]*:/iu.test(value) && !/^file:/iu.test(value);
}

/** Display filesystem sources relatively inside the workspace and absolutely outside; preserve other URIs. */
export function toDisplayPath(cwd: string, filePath: string): string {
  return relativeDisplayPath(cwd, filePath);
}

/** Resolve existing ancestors too, so missing provider files retain the workspace's canonical spelling. */
function canonicalDisplayPath(absolutePath: string): string {
  let current = absolutePath;
  const suffix: string[] = [];
  while (true) {
    try {
      return path.join(realpathSync(current), ...suffix.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return absolutePath;
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}
