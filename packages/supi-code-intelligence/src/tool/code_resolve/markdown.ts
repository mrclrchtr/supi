/** Markdown adapter for assembled code_resolve outcomes. */

import { renderEvidenceListMetadataDisclosure } from "../../analysis/evidence.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
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
  const discovery = details.outlineDiscoveryProvenance?.join("+") || "unavailable";
  const lines = [
    `# File outline of \`${details.outlineFile ?? "file"}\``,
    "",
    `- Group confidence: \`${details.confidence}\``,
    `- Discovery provenance: \`${discovery}\``,
  ];
  appendUnknownLevelDisclosure(lines, details.outlineUnknownLevelCount ?? 0);
  appendOutlineRecoveryDisclosure(lines, details);
  lines.push("");
  appendFileOutlineItems(lines, details);
  appendDisclosure(lines, details);
  return lines.join("\n");
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

function appendOutlineRecoveryDisclosure(lines: string[], details: ResolveDetails): void {
  if (!details.outlinePartialReason) return;
  const locations = (details.outlineErrorRanges ?? []).map(
    (range) => `L${range.start.line + 1}:${range.start.character + 1}`,
  );
  const errors = locations.length ? ` Error locations: ${locations.join(", ")}.` : "";
  lines.push(`- Partial discovery: ${details.outlinePartialReason}${errors}`);
}

function declarationCountHeading(count: number): string {
  return `**${count} declaration${count === 1 ? "" : "s"} discovered**`;
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
