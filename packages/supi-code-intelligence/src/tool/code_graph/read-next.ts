import { type ReadNextItem, readNextRange } from "../../analysis/read-next.ts";
import type { GraphSection } from "../../session/graph-types.ts";

/** Prefer the known enclosing scope, then alternate relation sites before the display cap. */
export function graphReadNext(sections: readonly GraphSection[]): ReadNextItem[] {
  const calls = sections.find((section) => section.kind === "ok" && section.rel === "callees");
  const scopeReads =
    calls?.kind === "ok"
      ? calls.readNext.map((item) => ({ ...item, reason: "inspect the enclosing scope" }))
      : [];
  const queues = sections.flatMap((section) => {
    if (section.kind !== "ok" || section.rel === "callees") return [];
    // Reference collection puts the approximate target range first. The known scope replaces it.
    return [
      section.rel === "references" && scopeReads.length > 0
        ? section.readNext.slice(1)
        : section.readNext,
    ];
  });
  const candidates = [...scopeReads];
  const maxLength = Math.max(0, ...queues.map((queue) => queue.length));
  for (let index = 0; index < maxLength; index++) {
    for (const queue of queues) {
      const item = queue[index];
      if (item) candidates.push(item);
    }
  }
  return mergeRanges(candidates)
    .slice(0, 3)
    .map((item) => readNextRange(item));
}

/** Merge connected ranges before bounding them, including ranges that bridge two earlier reads. */
function mergeRanges(items: readonly ReadNextItem[]): ReadNextItem[] {
  const result: ReadNextItem[] = [];
  for (const item of items) {
    const merged = { ...item };
    let firstIndex = result.length;
    let index = 0;
    while (index < result.length) {
      const other = result[index];
      if (
        other.file === merged.file &&
        other.startLine <= merged.endLine &&
        merged.startLine <= other.endLine
      ) {
        firstIndex = Math.min(firstIndex, index);
        if (
          merged.reason !== other.reason ||
          merged.startLine !== other.startLine ||
          merged.endLine !== other.endLine
        )
          merged.reason = "inspect related source ranges";
        merged.startLine = Math.min(merged.startLine, other.startLine);
        merged.endLine = Math.max(merged.endLine, other.endLine);
        result.splice(index, 1);
        index = 0;
      } else {
        index++;
      }
    }
    result.splice(firstIndex, 0, merged);
  }
  return result;
}
