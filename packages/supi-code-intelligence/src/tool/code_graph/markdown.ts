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
import type { AssembledGraphSection, GraphResultAssembly } from "./result.ts";

/** Render one target and one summary per requested relation. */
export function renderGraphResult(assembly: GraphResultAssembly): string {
  const lines = [
    `Target: ${graphCodeSpan(assembly.displayName)} — ${graphCodeSpan(assembly.resolvedDisplayFile)}`,
    "",
  ];
  for (const section of assembly.sections) lines.push(...renderSection(section, assembly), "");
  lines.push(...renderReadNextSection(assembledReadNext(assembly.assembled)));
  return lines.join("\n");
}

function renderSection(section: AssembledGraphSection, assembly: GraphResultAssembly): string[] {
  const source = section.rel === "callees" ? "structural" : "semantic";
  const depth = section.kind === "ok" && section.rel === "callees" ? `, ${section.data.depth}` : "";
  const lines = [`## ${section.rel} (${source}${depth})`];
  if (section.kind === "unavailable") return [...lines, `Unavailable — ${section.message}`];
  lines.push(
    formatGraphEvidence(
      section.evidence.metadata,
      section.rel === "callees" ? "call sites" : "locations",
      section.rel === "callees" ? 0 : section.data.externalCount,
    ),
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
  const groups = new Map<string, string[]>();
  for (const location of section.evidence.items) {
    const file = toDisplayPath(cwd, location.file);
    const sites = groups.get(file) ?? [];
    sites.push(`L${location.line}:${location.character}`);
    groups.set(file, sites);
  }
  return [...groups].map(([file, sites]) => `- ${graphCodeSpan(file)}: ${sites.join(", ")}`);
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
