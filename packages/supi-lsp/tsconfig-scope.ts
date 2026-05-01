// tsconfig-aware file scope detection.
//
// Determines whether a file is within the compilation scope of its nearest
// tsconfig.json by checking `include` and `exclude` patterns. Used by the
// diagnostic filter to suppress LSP errors on files that TypeScript itself
// would not type-check.

import * as fs from "node:fs";
import * as path from "node:path";

interface TsconfigInfo {
  dir: string;
  include: string[] | undefined;
  exclude: string[] | undefined;
}

const cache = new Map<string, TsconfigInfo | null>();

/**
 * Check whether a file is excluded by its nearest tsconfig.json.
 *
 * @param filePath - Project-relative file path (e.g., "packages/foo/__tests__/x.test.ts")
 * @param cwd - Absolute project root directory
 * @returns `true` if the file is excluded from compilation scope
 */
export function isFileExcludedByTsconfig(filePath: string, cwd: string): boolean {
  const absolutePath = path.resolve(cwd, filePath);
  const tsconfig = findNearestTsconfig(path.dirname(absolutePath), cwd);
  if (!tsconfig) return false;

  const relativeToTsconfig = path.relative(tsconfig.dir, absolutePath).replaceAll("\\", "/");

  // Check exclude patterns first
  if (tsconfig.exclude) {
    for (const pattern of tsconfig.exclude) {
      if (matchesPattern(relativeToTsconfig, pattern)) return true;
    }
  }

  // If include is specified, the file must match at least one pattern
  if (tsconfig.include) {
    let included = false;
    for (const pattern of tsconfig.include) {
      if (matchesPattern(relativeToTsconfig, pattern)) {
        included = true;
        break;
      }
    }
    if (!included) return true;
  }

  return false;
}

/**
 * Find the nearest tsconfig.json walking upward from `startDir`,
 * stopping at `rootDir`.
 */
function findNearestTsconfig(startDir: string, rootDir: string): TsconfigInfo | null {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cached = cache.get(dir);
    if (cached !== undefined) return cached;

    const tsconfigPath = path.join(dir, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
      const info = parseTsconfig(dir, tsconfigPath);
      cache.set(dir, info);
      return info;
    }

    if (path.relative(rootDir, dir).startsWith("..") || dir === rootDir) {
      // Don't look above the project root
      return null;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function parseTsconfig(dir: string, tsconfigPath: string): TsconfigInfo | null {
  try {
    const raw = fs.readFileSync(tsconfigPath, "utf-8");
    // Strip comments (minimal — handles single-line // and block /* */)
    const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const json = JSON.parse(cleaned);
    return {
      dir,
      include: json.include as string[] | undefined,
      exclude: json.exclude as string[] | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Lightweight pattern matching for tsconfig include/exclude patterns.
 * Handles directory names, extensions, recursive globs, and literal paths.
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replaceAll("\\", "/");

  // Recursive glob: **/*.ext
  if (normalizedPattern.startsWith("**/")) {
    const suffix = normalizedPattern.slice(3); // e.g., "*.ts"
    return matchesPattern(filePath, suffix) || filePath.includes(`/${suffix}`);
  }

  // Directory match: pattern has no glob chars and no "."
  // e.g., "node_modules" or "__tests__"
  if (!normalizedPattern.includes("*") && !normalizedPattern.includes(".")) {
    return (
      filePath === normalizedPattern ||
      filePath.startsWith(`${normalizedPattern}/`) ||
      filePath.includes(`/${normalizedPattern}/`)
    );
  }

  // Simple glob: *.ext — match basename
  if (normalizedPattern.startsWith("*.")) {
    const ext = normalizedPattern.slice(1); // e.g., ".ts"
    return filePath.endsWith(ext) && !filePath.includes("/", filePath.length - ext.length - 1);
  }

  // Literal path
  if (!normalizedPattern.includes("*")) {
    return filePath === normalizedPattern || filePath.startsWith(`${normalizedPattern}/`);
  }

  // Fallback: path contains the pattern segment
  return filePath.includes(`/${normalizedPattern}`) || filePath === normalizedPattern;
}

/**
 * Clear the tsconfig cache. Useful for testing or after filesystem changes.
 */
export function clearTsconfigCache(): void {
  cache.clear();
}
