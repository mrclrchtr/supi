import type { ReferenceEntry } from "../../analysis/relations/types.ts";

/**
 * Select one site per file per round from normalized, file/source-ordered references.
 * Preserve that order for display; callers retain completeness from the full collected list.
 */
export function selectReferenceLocations(
  references: readonly ReferenceEntry[],
  limit: number,
): ReferenceEntry[] {
  if (references.length <= limit) return [...references];
  const byFile = new Map<string, number[]>();
  for (const [index, reference] of references.entries()) {
    const indices = byFile.get(reference.file) ?? [];
    indices.push(index);
    byFile.set(reference.file, indices);
  }
  const selected = new Set<number>();
  let activeFiles = [...byFile.values()];
  for (let round = 0; selected.size < limit && activeFiles.length > 0; round++) {
    const remaining: number[][] = [];
    for (const indices of activeFiles) {
      if (selected.size === limit) break;
      selected.add(indices[round]);
      if (indices.length > round + 1) remaining.push(indices);
    }
    activeFiles = remaining;
  }
  return references.filter((_, index) => selected.has(index));
}
