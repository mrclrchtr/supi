import * as fs from "node:fs";
import * as path from "node:path";

const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".pnpm"]);

/**
 * Walk a project directory tree, calling `onDirectory` for each directory.
 * Skips `node_modules`, `.git`, and `.pnpm`.
 * Stops at depth 0.
 */
export function walkProject(
  directory: string,
  depth: number,
  onDirectory: (directory: string, entryNames: Set<string>) => void,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  const entryNames = new Set(entries.map((entry) => entry.name));
  onDirectory(directory, entryNames);

  if (depth <= 0) return;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    walkProject(path.join(directory, entry.name), depth - 1, onDirectory);
  }
}

/**
 * Search upward from `startDir` for any of the `markers` files/dirs.
 * Returns the directory containing the first found marker, or `fallback`.
 */
export function findProjectRoot(startDir: string, markers: string[], fallback: string): string {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return fallback;
}

/**
 * Deduplicate overlapping roots, keeping only the topmost (shortest path) roots.
 */
export function dedupeTopmostRoots(roots: string[]): string[] {
  const accepted: string[] = [];

  for (const root of [...new Set(roots.map((entry) => path.resolve(entry)))].sort(byPathDepth)) {
    const isChild = accepted.some((parent) => root !== parent && isWithin(parent, root));
    if (!isChild) {
      accepted.push(root);
    }
  }

  return accepted;
}

/**
 * Minimal shape accepted by `buildKnownRootsMap`.
 * Structurally compatible with `DetectedProjectServer` and similar
 * `{ name, root }` records — callers may pass a wider type safely.
 */
export type KnownRootEntry = { name: string; root: string };

/**
 * Build a map of language/server name to sorted, deduplicated root paths.
 *
 * Accepts an array of detected project entries (e.g. from LSP project discovery)
 * and groups them by name with roots sorted by specificity.
 */
export function buildKnownRootsMap(detected: KnownRootEntry[]): Map<string, string[]> {
  const next = new Map<string, string[]>();

  for (const entry of detected) {
    const roots = next.get(entry.name) ?? [];
    if (!roots.includes(entry.root)) roots.push(entry.root);
    next.set(entry.name, sortRootsBySpecificity(roots));
  }

  return next;
}

/**
 * Merge a new root into an existing list, deduplicating and sorting.
 *
 * Returns the original reference when the root is already present.
 */
export function mergeKnownRoots(roots: string[], root: string): string[] {
  if (roots.includes(root)) return roots;
  return sortRootsBySpecificity([...roots, root]);
}

/**
 * Resolve the most specific known root that contains `filePath`.
 *
 * Searches the given roots list (presumed sorted by specificity) and returns
 * the first root that contains or equals `filePath`.
 *
 * @returns The matching root string, or `null` when none match.
 */
export function resolveKnownRoot(filePath: string, roots: string[]): string | null {
  const resolvedPath = path.resolve(filePath);
  return roots.find((root) => isWithinOrEqual(root, resolvedPath)) ?? null;
}

/**
 * Sort roots by specificity (deepest/longest first), then alphabetically.
 *
 * Deduplicates by resolved path before sorting.
 */
export function sortRootsBySpecificity(roots: string[]): string[] {
  return [...new Set(roots.map((root) => path.resolve(root)))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
}

/**
 * Check if `child` is strictly inside `parent`.
 *
 * Returns `true` when `child` is a subdirectory of `parent`.
 * Returns `false` for the same path.
 */
export function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== "..";
}

/**
 * Check if `filePath` is inside `root` or is the same path.
 *
 * Combines exact-path equality with `isWithin` semantics.
 */
export function isWithinOrEqual(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === "" || isWithin(root, filePath);
}

/**
 * Comparator for sorting paths by depth (shallowest first), then alphabetically.
 *
 * Useful with `.sort()` on arrays of path strings.
 */
export function byPathDepth(a: string, b: string): number {
  const depthDiff = segmentCount(a) - segmentCount(b);
  return depthDiff !== 0 ? depthDiff : a.localeCompare(b);
}

/**
 * Count path segments in a resolved absolute path.
 *
 * @example segmentCount("/a/b/c") // 3
 */
export function segmentCount(target: string): number {
  return path.resolve(target).split(path.sep).filter(Boolean).length;
}
