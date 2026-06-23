/**
 * Markdown renderer for code_resolve results.
 *
 * Produces compact, agent-friendly markdown showing resolved targets
 * with stable handles, disambiguation candidates, or actionable errors.
 */

import type {
  DisambiguationCandidateEntry,
  ResolvedTargetEntry,
  ResolveServiceResult,
} from "../../analysis/resolve/service.ts";
import { renderEvidenceListMetadataDisclosure } from "../../evidence-list.ts";

/** Render a full resolve service result into markdown. */
export function renderResolveResult(result: ResolveServiceResult, _cwd: string): string {
  switch (result.kind) {
    case "resolved":
      return renderResolved(result.targets, result.omittedCount, result.confidence);
    case "disambiguation":
      return renderDisambiguation(result.candidates, result.omittedCount);
    case "error":
      return result.message;
  }
}

function renderResolved(
  targets: ResolvedTargetEntry[],
  omittedCount: number,
  confidence: string,
): string {
  if (targets.length === 0) {
    return "No targets resolved.";
  }

  const lines: string[] = [];

  if (targets.length === 1) {
    const t = targets[0];
    const kind = t.kind ? ` \`${t.kind}\`` : "";
    const name = t.name ? ` **${t.name}**${kind}` : "";

    lines.push(`Resolved${name}:`);
    lines.push("");
    lines.push(`- File: \`${t.file}\``);
    lines.push(`- Line: ${t.displayLine}, Column: ${t.displayCharacter}`);
    lines.push(`- Target ID: \`${t.targetId}\``);
    lines.push(`- Span ID: \`${t.spanId}\``);
    lines.push(`- Confidence: \`${confidence}\``);
    lines.push(`- Provenance: \`${t.provenance}\``);
    lines.push("");
  } else {
    lines.push(`Resolved ${targets.length} target(s):`);
    lines.push("");

    for (const t of targets) {
      const kind = t.kind ? ` (\`${t.kind}\`)` : "";
      const name = t.name ?? "(unnamed)";
      lines.push(
        `- \`${t.file}\`:${t.displayLine}:${t.displayCharacter} — **${name}**${kind} — \`${t.targetId}\``,
      );
    }

    const disclosure = renderEvidenceListMetadataDisclosure({
      key: "resolve.targets",
      totalCount: targets.length + omittedCount,
      shownCount: targets.length,
      omittedCount,
      partialReason: null,
    });
    if (disclosure) {
      lines.push(disclosure);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderDisambiguation(
  candidates: DisambiguationCandidateEntry[],
  omittedCount: number,
): string {
  const lines: string[] = [];

  lines.push("# Multiple matches found");
  lines.push("");
  lines.push("Resolve by file + line + character, or refine with scope/kind:");
  lines.push("");

  for (const c of candidates) {
    const kind = c.kind ? ` (\`${c.kind}\`)` : "";
    const container = c.container ? ` in \`${c.container}\`` : "";
    lines.push(
      `${c.rank}. **${c.name}**${kind}${container} — \`${c.file}\`:${c.line}:${c.character}`,
    );
    lines.push(`   Target ID: \`${c.targetId}\``);
  }

  const disclosure = renderEvidenceListMetadataDisclosure({
    key: "resolve.candidates",
    totalCount: candidates.length + omittedCount,
    shownCount: candidates.length,
    omittedCount,
    partialReason: null,
  });
  if (disclosure) {
    lines.push("");
    lines.push(disclosure);
  }

  return lines.join("\n");
}
