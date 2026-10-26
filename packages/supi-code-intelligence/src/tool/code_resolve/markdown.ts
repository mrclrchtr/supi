/** Markdown adapter for assembled code_resolve outcomes. */

import { relative } from "node:path";
import { renderEvidenceListMetadataDisclosure } from "../../analysis/evidence.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import { formatPartialCandidateDisclosure } from "../result/candidate-row.ts";
import type { ResolveDetails } from "../result/types.ts";
import type { ResolveResultAssembly } from "./result.ts";

/** Render an assembled resolve result into markdown. */
export function renderResolveResult(assembly: ResolveResultAssembly): string {
  const { outcome, cwd } = assembly;
  switch (outcome.kind) {
    case "resolved":
      return renderResolved(outcome.entry, outcome.notes, cwd);
    case "target-group":
      return renderTargetGroup(assembly.details);
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
  target: Readonly<TargetStoreEntry>,
  notes: readonly string[],
  cwd: string,
): string {
  const relFile = relative(cwd, target.file) || target.file;
  const displayKind = target.nativeKind ?? target.kind;
  const kind = displayKind ? ` \`${displayKind}\`` : "";
  const name = target.name ? ` **${target.name}**${kind}` : "";
  const lines = [
    `${name.trim() || "Resolved target"} — \`${relFile}:${target.displayLine}:${target.displayCharacter}\``,
    `Handle: \`${target.targetId}\``,
    `confidence: ${target.confidence}; provenance: ${target.provenance.join("+")}`,
  ];

  const resolutionNote = renderAnchoredResolutionNote(target);
  if (resolutionNote) lines.push("", resolutionNote);
  for (const note of notes) {
    if (resolutionNote && isResolutionMetadataNote(note)) continue;
    lines.push("", `_Note: ${note}_`);
  }
  return lines.join("\n");
}

function isResolutionMetadataNote(note: string): boolean {
  return (
    note.startsWith("Resolved from a declaration header and snapped to the identifier") ||
    note === "Resolved from provider-backed structural identifier evidence."
  );
}

function renderTargetGroup(details: ResolveDetails): string {
  const discovery = details.groupDiscoveryProvenance?.join("+") || "unavailable";
  const lines = [
    `# Targets in \`${details.groupFile ?? "file"}\``,
    "",
    `- Group confidence: \`${details.confidence}\``,
    `- Discovery provenance: \`${discovery}\``,
  ];
  appendUnknownHierarchyDisclosure(lines, details.groupUnknownNestingCount ?? 0);
  appendGroupRecoveryDisclosure(lines, details);
  lines.push("");
  appendTargetGroupItems(lines, details);
  appendDisclosure(lines, details);
  return lines.join("\n");
}

function appendTargetGroupItems(lines: string[], details: ResolveDetails): void {
  if (details.targets.length === 0) {
    lines.push(
      details.groupPartialReason
        ? "No declarations were collected before structural recovery limited discovery."
        : "No declarations were reported for this file.",
    );
    return;
  }
  lines.push(declarationCountHeading(details.targetCount), "");
  for (const target of details.targets) {
    const displayKind = target.nativeKind ?? target.kind;
    const kind = displayKind ? ` (\`${displayKind}\`)` : "";
    const container = target.container ? ` in \`${target.container}\`` : "";
    lines.push(
      `- \`${target.targetId}\` **${target.name ?? "anonymous"}**${kind}${container} — \`${target.displayLine}:${target.displayCharacter}\` (${target.anchorKind} anchor, ${target.confidence}, provenance: ${target.provenance.join("+")})`,
    );
  }
}

function appendGroupRecoveryDisclosure(lines: string[], details: ResolveDetails): void {
  if (!details.groupPartialReason) return;
  const locations = (details.groupErrorRanges ?? []).map(
    (range) => `L${range.start.line + 1}:${range.start.character + 1}`,
  );
  const errors = locations.length ? ` Error locations: ${locations.join(", ")}.` : "";
  lines.push(`- Partial discovery: ${details.groupPartialReason}${errors}`);
}

function declarationCountHeading(count: number): string {
  return `**${count} declaration${count === 1 ? "" : "s"} discovered**`;
}

function appendUnknownHierarchyDisclosure(lines: string[], count: number): void {
  if (count <= 0) return;
  const declaration = count === 1 ? "declaration has" : "declarations have";
  lines.push(
    `- Hierarchy: ${count} ${declaration} unknown hierarchy; only provider-proven top-level declarations were prioritized.`,
  );
}

function renderAnchoredResolutionNote(target: Readonly<TargetStoreEntry>): string | null {
  const resolution = target.resolution;
  if (!resolution) return null;
  const degraded = resolution.source !== "semantic";
  if (!resolution.snapped && !degraded) return null;

  const requested = `${resolution.requested.line}:${resolution.requested.character}`;
  const resolved = `${resolution.resolved.line}:${resolution.resolved.character}`;
  if (resolution.snapped) {
    return `_Note: snapped from requested coordinate ${requested} to name anchor ${resolved} (evidence: ${resolution.source})._`;
  }
  return `_Note: resolved from ${resolution.source} evidence; use code_inspect for point-level facts._`;
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
