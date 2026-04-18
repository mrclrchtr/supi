import * as path from "node:path";
import type { DetectedProjectServer } from "./types.ts";

export function buildKnownRootsMap(detected: DetectedProjectServer[]): Map<string, string[]> {
  const next = new Map<string, string[]>();

  for (const entry of detected) {
    const roots = next.get(entry.name) ?? [];
    if (!roots.includes(entry.root)) roots.push(entry.root);
    next.set(entry.name, sortRootsBySpecificity(roots));
  }

  return next;
}

export function mergeKnownRoots(roots: string[], root: string): string[] {
  if (roots.includes(root)) return roots;
  return sortRootsBySpecificity([...roots, root]);
}

export function resolveKnownRoot(filePath: string, roots: string[]): string | null {
  const resolvedPath = path.resolve(filePath);
  return roots.find((root) => isWithinOrEqual(root, resolvedPath)) ?? null;
}

function sortRootsBySpecificity(roots: string[]): string[] {
  return [...new Set(roots.map((root) => path.resolve(root)))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
}

function isWithinOrEqual(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}
