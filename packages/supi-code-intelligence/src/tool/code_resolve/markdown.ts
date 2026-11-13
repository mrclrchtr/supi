/** Markdown adapter for assembled code_resolve outcomes. */

import { renderEvidenceListMetadataDisclosure } from "../../analysis/evidence.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { TargetProviderProvenance } from "../../session/target-store.ts";
import type { TargetWorkflowOutcome } from "../../session/target-workflow.ts";
import { formatPartialCandidateDisclosure } from "../result/candidate-row.ts";
import type { ResolveDetails } from "../result/types.ts";
import type { ResolveResultAssembly } from "./result.ts";

/** Render an assembled resolve result into markdown. */
export function renderResolveResult(assembly: ResolveResultAssembly): string {
  const { outcome, cwd } = assembly;
  switch (outcome.kind) {
    case "resolved":
      return renderResolved(outcome, cwd);
    case "file-outline":
      return renderFileOutline(assembly.details);
    case "disambiguation":
      return renderDisambiguation(assembly.details);
    case "kind-mismatch":
      return renderKindMismatch(assembly.details);
    case "invalid-input":
      return `**Error:** ${outcome.message}`;
    case "unavailable":
      return `**Unavailable:** ${outcome.reason}`;
  }
}

function renderResolved(
  outcome: Extract<TargetWorkflowOutcome, { kind: "resolved" }>,
  cwd: string,
): string {
  const { entry: target, notes } = outcome;
  const relFile = toDisplayPath(cwd, target.file);
  const displayKind = target.nativeKind ?? target.kind;
  const kind = displayKind ? ` \`${displayKind}\`` : "";
  const name = target.name ? ` **${target.name}**${kind}` : "";
  const lines = [
    `${name.trim() || "Resolved target"} — \`${relFile}:${target.displayLine}:${target.displayCharacter}\``,
    `Handle: \`${target.targetId}\``,
    `confidence: ${target.confidence}; provenance: ${target.provenance.join("+")}`,
  ];

  for (const note of notes) {
    lines.push("", `_Note: ${note}_`);
  }
  return lines.join("\n");
}

function renderFileOutline(details: ResolveDetails): string {
  const lines = [`# File outline of \`${details.outlineFile ?? "file"}\``, ""];
  lines.push(`- Sources: ${outlineSources(details.outlineDiscoveryProvenance ?? [])}`);
  appendUnknownLevelDisclosure(lines, details.outlineUnknownLevelCount ?? 0);
  appendOutlineRecoveryDisclosure(lines, details);
  lines.push("");
  appendFileOutlineItems(lines, details);
  appendDisclosure(lines, details);
  appendNotListed(lines, details);
  return lines.join("\n");
}

const SOURCE_NAMES: Record<TargetProviderProvenance, string> = {
  semantic: "language server",
  structural: "syntax parser",
};

function outlineSources(provenance: readonly TargetProviderProvenance[]): string {
  return provenance.length
    ? provenance.map((source) => SOURCE_NAMES[source]).join(" and ")
    : "none";
}

function appendFileOutlineItems(lines: string[], details: ResolveDetails): void {
  if (details.targets.length === 0) {
    lines.push(
      details.outlinePartialReason
        ? "No declarations were collected before structural recovery limited discovery."
        : "No declarations were reported for this file.",
    );
    return;
  }
  const count = details.targetCount;
  lines.push(
    `${count} declaration${count === 1 ? "" : "s"}: top-level declarations in source order, members indented below their container. Pass a handle as target.handle to code_graph, code_inspect, or code_refactor_plan.`,
    "",
  );
  appendGroupedRows(lines, details.targets);
}

type OutlineRowTarget = ResolveDetails["targets"][number];

/**
 * Render each visible member directly below its visible container, so the
 * container name is not repeated per row. Members whose container is not a
 * uniquely named visible row keep an explicit `in` suffix.
 */
function appendGroupedRows(lines: string[], targets: readonly OutlineRowTarget[]): void {
  const containerCounts = new Map<string, number>();
  for (const target of targets) {
    if (target.name) containerCounts.set(target.name, (containerCounts.get(target.name) ?? 0) + 1);
  }
  const children = new Map<string, OutlineRowTarget[]>();
  const roots: OutlineRowTarget[] = [];
  for (const target of targets) {
    const container = target.container;
    if (container && container !== target.name && containerCounts.get(container) === 1) {
      children.set(container, [...(children.get(container) ?? []), target]);
    } else {
      roots.push(target);
    }
  }
  const emit = (target: OutlineRowTarget, depth: number): void => {
    lines.push(outlineRow(target, depth));
    const own = target.name ? children.get(target.name) : undefined;
    if (!own) return;
    children.delete(target.name ?? "");
    for (const child of own) emit(child, depth + 1);
  };
  for (const root of roots) emit(root, 0);
  // Containers that are themselves grouped under a hidden row fall back to suffixes.
  for (const orphans of children.values()) for (const orphan of orphans) emit(orphan, 0);
}

/** One compact row; evidence notes appear only when they differ from the usual case. */
function outlineRow(target: OutlineRowTarget, depth: number): string {
  const displayKind = outlineKind(target.nativeKind ?? target.kind);
  const kind = displayKind ? `${displayKind} ` : "";
  const container = depth === 0 && target.container ? ` in \`${target.container}\`` : "";
  const indent = "  ".repeat(depth);
  const suffix = target.provenance.includes("semantic") ? "" : " (syntax parser only)";
  const name = (target.name ?? "anonymous").replace(/\s+/g, " ");
  return `${indent}- \`${target.targetId}\` ${kind}\`${name}\`${container} — L${target.displayLine}:${target.displayCharacter}${suffix}`;
}

/** Lower-case words for both providers' kinds, e.g. `EnumMember` -> `enum member`. */
function outlineKind(kind: string | null | undefined): string {
  return (kind ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function appendNotListed(lines: string[], details: ResolveDetails): void {
  const notListed = details.outlineNotListed;
  if (!notListed) return;
  const span = (value: { startLine: number; endLine: number }) =>
    value.startLine === value.endLine
      ? `L${value.startLine}`
      : `L${value.startLine}–L${value.endLine}`;
  const rows = [
    ...(notListed.importedNames
      ? [
          `- ${plural(notListed.importedNames.count, "imported name")} (${span(notListed.importedNames)}). Read those lines, or resolve a name with code_resolve target.symbol.`,
        ]
      : []),
    ...(notListed.reExportStatements
      ? [
          `- ${plural(notListed.reExportStatements.count, "`export … from` statement")} (${span(notListed.reExportStatements)}); they forward names declared in other modules.`,
        ]
      : []),
    ...(notListed.exportListNames
      ? [
          `- ${plural(notListed.exportListNames.count, "name")} in export lists (${span(notListed.exportListNames)}). Read those lines, or find them with code_find search.ast, kind "export", a name fragment as query, and scopes set to this file.`,
        ]
      : []),
    ...(notListed.localDeclarations > 0
      ? [
          `- ${plural(notListed.localDeclarations, "declaration")} inside function, method, or constructor bodies. Resolve one with code_resolve target.symbol and scope set to this file.`,
        ]
      : []),
  ];
  if (rows.length) lines.push("", "Not listed:", ...rows);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function appendOutlineRecoveryDisclosure(lines: string[], details: ResolveDetails): void {
  if (!details.outlinePartialReason) return;
  const locations = (details.outlineErrorRanges ?? []).map(
    (range) => `L${range.start.line + 1}:${range.start.character + 1}`,
  );
  const errors = locations.length ? ` Error locations: ${locations.join(", ")}.` : "";
  lines.push(`- Partial discovery: ${details.outlinePartialReason}${errors}`);
}

function appendUnknownLevelDisclosure(lines: string[], count: number): void {
  if (count <= 0) return;
  const declarations = count === 1 ? "declaration has" : "declarations have";
  lines.push(
    `- Position unknown: ${count} ${declarations} no enclosing declaration reported by the language server, so ${count === 1 ? "it is" : "they are"} listed after the top-level declarations.`,
  );
}

function renderDisambiguation(details: ResolveDetails): string {
  const lines = [
    "# Multiple matches found",
    "",
    "Choose one handle, or narrow target.symbol with scope or symbolKind:",
    "",
  ];
  appendCandidates(lines, details);
  appendDisclosure(lines, details);
  return lines.join("\n");
}

function renderKindMismatch(details: ResolveDetails): string {
  const lines = [
    "# No exact symbol-kind match",
    "",
    `No query candidate was reported as provider kind \`${details.requestedKind ?? "unknown"}\`.`,
    "Near matches:",
    "",
  ];
  appendCandidates(lines, details);
  lines.push(
    "",
    "Retry without `symbolKind`, use an observed provider kind, or choose a handle explicitly.",
  );
  appendDisclosure(lines, details);
  return lines.join("\n");
}

function appendCandidates(lines: string[], details: ResolveDetails): void {
  for (const candidate of details.candidates ?? []) {
    const kind = candidate.kind ? ` (\`${candidate.kind}\`)` : "";
    const container = candidate.container ? ` in \`${candidate.container}\`` : "";
    lines.push(
      `${candidate.rank}. **${candidate.name}**${kind}${container} — \`${candidate.file}\`:${candidate.line}:${candidate.character}`,
      `   Target ID: \`${candidate.targetId}\``,
    );
  }
}

function appendDisclosure(lines: string[], details: ResolveDetails): void {
  const evidence = details.evidenceLists?.[0];
  const disclosure = evidence
    ? (formatPartialCandidateDisclosure(evidence) ?? renderEvidenceListMetadataDisclosure(evidence))
    : null;
  if (disclosure) lines.push("", disclosure);
}
