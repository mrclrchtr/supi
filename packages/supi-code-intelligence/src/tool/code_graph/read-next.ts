import { type ReadNextItem, readNextRange, readNextTopSites } from "../../analysis/read-next.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { AssembledGraphSection } from "./result.ts";

/** Prefer the known enclosing scope, then alternate relation sites before the display cap. */
export function graphReadNext(
  sections: readonly AssembledGraphSection[],
  cwd: string,
): ReadNextItem[] {
  const calls = sections.find((section) => section.kind === "ok" && section.rel === "callees");
  const scopeReads =
    calls?.kind === "ok"
      ? calls.readNext.map((item) => ({ ...item, reason: "inspect the enclosing scope" }))
      : [];
  const queues = sections.flatMap((section) => {
    if (section.kind !== "ok" || section.rel === "callees") return [];
    if (section.rel !== "references") return [section.readNext];
    // Collection supplies the target range; reference sites come only from selected evidence.
    const target = section.readNext[0];
    const sites = referenceReadNext(section, cwd, scopeReads[0]?.file ?? target?.file);
    return [scopeReads.length > 0 || !target ? sites : [target, ...sites]];
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

/** Prefer new files, then the target file, before filling remaining slots with repeated files. */
function referenceReadNext(
  section: Extract<AssembledGraphSection, { kind: "ok"; rel: "references" }>,
  cwd: string,
  targetFile: string | undefined,
): ReadNextItem[] {
  const sites = section.evidence.items.map((site) => ({
    file: toDisplayPath(cwd, site.file),
    line: site.line,
  }));
  const firstByFile = new Map<string, (typeof sites)[number]>();
  for (const site of sites) {
    if (!firstByFile.has(site.file)) firstByFile.set(site.file, site);
  }
  const distinct = [...firstByFile.values()];
  return readNextTopSites(
    [
      ...distinct.filter((site) => site.file !== targetFile),
      ...distinct.filter((site) => site.file === targetFile),
      ...sites.filter((site) => firstByFile.get(site.file) !== site),
    ],
    2,
    "reference",
  );
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
