/** Markdown adapter for assembled code_graph evidence. */

import { renderReadNextSection } from "../../analysis/read-next.ts";
import type { CallEntry, CalleeScope } from "../../analysis/relations/types.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import { assembledReadNext } from "../result/assembly.ts";
import {
  compactGraphLabel,
  formatGraphEvidence,
  formatGraphRange,
  graphCodeSpan,
} from "./format.ts";
import type { GraphResultAssembly } from "./result.ts";
import type { AssembledGraphSection } from "./section.ts";

/** Longest source-line preview shown beside a reference or implementation site. */
const SOURCE_LINE_LIMIT = 160;

/** Render one target and one summary per requested relation. */
export function renderGraphResult(assembly: GraphResultAssembly): string {
  const lines = [
    `Target: ${graphCodeSpan(assembly.displayName)} — ${graphCodeSpan(assembly.resolvedDisplayFile)}`,
    "",
  ];
  for (const note of assembly.notes) lines.push(`_Note: ${note}_`, "");
  for (const section of assembly.sections) lines.push(...renderSection(section, assembly), "");
  lines.push(...renderReadNextSection(assembledReadNext(assembly.assembled)));
  return lines.join("\n");
}

function renderSection(section: AssembledGraphSection, assembly: GraphResultAssembly): string[] {
  const source = section.rel === "callees" ? "structural" : "semantic";
  const depth = section.kind === "ok" && section.rel === "callees" ? `, ${section.data.depth}` : "";
  const lines = [`## ${section.rel} (${source}${depth})`];
  if (section.kind === "unavailable") return [...lines, `Unavailable — ${section.message}`];
  const summary = formatGraphEvidence(
    section.evidence.metadata,
    section.rel === "callees" ? "call sites" : "locations",
    section.rel === "callees" ? 0 : section.data.externalCount,
  );
  lines.push(
    section.rel === "references" && section.selectionNote
      ? `${summary} — ${section.selectionNote}`
      : summary,
    "",
  );
  if (section.rel !== "callees") return [...lines, ...formatLocations(section, assembly.cwd)];
  return [
    ...lines,
    formatScope(section.data.enclosingScope, assembly.displayName),
    section.data.depth === "direct"
      ? "Nested scopes excluded; calls are source expressions, not resolved symbols."
      : "Nested scopes included; calls are source expressions, not resolved symbols.",
    "",
    ...formatCalls(section.evidence.items, assembly),
  ];
}

function formatScope(scope: CalleeScope, targetName: string): string {
  const name = scope.name === targetName ? "" : `${graphCodeSpan(scope.name)} — `;
  return `Scope: ${name}${formatGraphRange(scope)}`;
}

function formatLocations(
  section: Extract<AssembledGraphSection, { kind: "ok"; rel: "references" | "implements" }>,
  cwd: string,
): string[] {
  // One row per source line: sites on the same line share its text.
  const groups = new Map<string, Map<number, { sites: string[]; text: string | undefined }>>();
  for (const location of section.evidence.items) {
    const file = toDisplayPath(cwd, location.file);
    const rows = groups.get(file) ?? new Map();
    const row = rows.get(location.line) ?? { sites: [], text: location.text };
    row.sites.push(`L${location.line}:${location.character}`);
    rows.set(location.line, row);
    groups.set(file, rows);
  }
  return [...groups].flatMap(([file, rows]) => {
    const entries = [...rows.values()];
    // No readable source: keep the compact one-row form.
    if (entries.every((row) => row.text === undefined)) {
      return [`- ${graphCodeSpan(file)}: ${entries.flatMap((row) => row.sites).join(", ")}`];
    }
    return [
      `- ${graphCodeSpan(file)}`,
      ...entries.map((row) => {
        const source = row.text
          ? ` — ${graphCodeSpan(compactGraphLabel(row.text, SOURCE_LINE_LIMIT))}`
          : "";
        return `  - ${row.sites.join(", ")}${source}`;
      }),
    ];
  });
}

/** Group by the full expression, never by a shortened display label. */
function formatCalls(calls: readonly CallEntry[], assembly: GraphResultAssembly): string[] {
  const groups = new Map<string, { name: string; file: string; sites: string[] }>();
  for (const call of calls) {
    const file = toDisplayPath(assembly.cwd, call.file);
    const key = JSON.stringify([file, call.name]);
    const group = groups.get(key) ?? { name: call.displayName ?? call.name, file, sites: [] };
    group.sites.push(`L${call.line}:${call.character}`);
    groups.set(key, group);
  }
  const previews = [...groups.values()].map((group) => ({
    ...group,
    label: compactGraphLabel(group.name),
  }));
  const collisions = new Map<string, { count: number; seen: number }>();
  for (const { file, label } of previews) {
    const key = JSON.stringify([file, label]);
    const count = (collisions.get(key)?.count ?? 0) + 1;
    collisions.set(key, { count, seen: 0 });
  }
  return previews.map(({ label, file, sites }) => {
    const collision = collisions.get(JSON.stringify([file, label]));
    let qualifier = "";
    if (collision && collision.count > 1) {
      collision.seen++;
      qualifier = ` (expression ${collision.seen}/${collision.count})`;
    }
    const prefix = file === assembly.resolvedDisplayFile ? "" : `${graphCodeSpan(file)}: `;
    return `- ${graphCodeSpan(label)}${qualifier} — ${prefix}${sites.join(", ")}`;
  });
}
