/** Markdown adapter for assembled code_resolve outcomes. */

import { relative } from "node:path";
import { renderEvidenceListMetadataDisclosure } from "../../analysis/evidence.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import type { ResolveResultAssembly } from "../result/resolve.ts";

/** Render an assembled resolve result into markdown. */
export function renderResolveResult(assembly: ResolveResultAssembly): string {
  const { outcome, cwd } = assembly;
  switch (outcome.kind) {
    case "resolved":
      return renderResolved(outcome.entry, outcome.notes, cwd);
    case "disambiguation":
      return renderDisambiguation(outcome.candidates, outcome.omittedCount);
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
  const kind = target.kind ? ` \`${target.kind}\`` : "";
  const name = target.name ? ` **${target.name}**${kind}` : "";
  const lines = [
    `Resolved${name}:`,
    "",
    `- File: \`${relFile}\``,
    `- Line: ${target.displayLine}, Column: ${target.displayCharacter}`,
    `- Target ID: \`${target.targetId}\``,
    `- Span ID: \`${target.spanId}\``,
    `- Confidence: \`${target.confidence}\``,
    `- Provenance: \`${target.provenance}\``,
  ];

  const resolutionNote = renderAnchoredResolutionNote(target);
  if (resolutionNote) lines.push("", resolutionNote);
  for (const note of notes) lines.push("", `_Note: ${note}_`);
  return lines.join("\n");
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

function renderDisambiguation(
  candidates: ReadonlyArray<{
    targetId: string;
    name: string;
    kind: string | null;
    container: string | null;
    file: string;
    line: number;
    character: number;
    rank: number;
  }>,
  omittedCount: number,
): string {
  const lines = [
    "# Multiple matches found",
    "",
    "Choose one handle, or narrow target.symbol with scope or symbolKind:",
    "",
  ];

  for (const candidate of candidates) {
    const kind = candidate.kind ? ` (\`${candidate.kind}\`)` : "";
    const container = candidate.container ? ` in \`${candidate.container}\`` : "";
    lines.push(
      `${candidate.rank}. **${candidate.name}**${kind}${container} — \`${candidate.file}\`:${candidate.line}:${candidate.character}`,
      `   Target ID: \`${candidate.targetId}\``,
    );
  }

  const disclosure = renderEvidenceListMetadataDisclosure({
    key: "resolve.candidates",
    totalCount: candidates.length + omittedCount,
    shownCount: candidates.length,
    omittedCount,
    partialReason: null,
  });
  if (disclosure) lines.push("", disclosure);
  return lines.join("\n");
}
