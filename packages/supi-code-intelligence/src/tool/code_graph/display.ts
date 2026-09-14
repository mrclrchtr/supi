import type { CallEntry, ReferenceEntry } from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import { createToolDisplaySection } from "../result/display.ts";
import type { ToolDisplaySection } from "../result/types.ts";
import type { GraphFileGroup } from "./details.ts";
import { compactGraphLabel } from "./format.ts";
import type { AssembledGraphSection } from "./result.ts";

/** Bound sites before grouping them. Each file group partitions the display rows. */
export function graphDisplaySection(
  section: AssembledGraphSection,
  cwd: string,
): {
  display: ToolDisplaySection;
  fileGroups: GraphFileGroup[];
} {
  if (section.kind === "unavailable") {
    return {
      display: createToolDisplaySection({
        key: `graph.${section.rel}`,
        title: section.rel,
        items: [],
        format: () => "",
      }),
      fileGroups: [],
    };
  }
  const items = section.evidence.items as readonly (CallEntry | ReferenceEntry)[];
  const display = createToolDisplaySection({
    key: `graph.${section.rel}`,
    title: section.rel,
    items,
    totalCount: section.evidence.metadata.totalCount,
    omittedCount: section.evidence.metadata.omittedCount,
    partialReason: section.evidence.metadata.partialReason,
    format: (item) => {
      const site = `L${item.line}:${item.character}`;
      if (section.rel !== "callees") return site;
      const call = item as CallEntry;
      return `${site} — ${compactGraphLabel(call.displayName ?? call.name)}`;
    },
  });
  const groups = new Map<string, string[]>();
  for (let index = 0; index < display.shownCount; index++) {
    const file = toDisplayPath(cwd, items[index].file);
    const rows = groups.get(file) ?? [];
    rows.push(display.lines[index]);
    groups.set(file, rows);
  }
  return {
    display: { ...display, lines: [...groups.values()].flat() },
    fileGroups: [...groups].map(([file, rows]) => ({ file, count: rows.length })),
  };
}
