/**
 * Markdown renderer for code_resolve results.
 *
 * Produces compact, agent-friendly markdown showing resolved targets
 * with stable handles, disambiguation candidates, or actionable errors.
 */

import { relative } from "node:path";
import type {
  DisambiguationCandidate,
  ResolveServiceResult,
} from "../../analysis/resolve/service.ts";
import type { TargetStoreEntry } from "../../session/target-store.ts";
import { renderEvidenceListMetadataDisclosure } from "../evidence-list.ts";

/**
 * Render a provenance note for an anchored resolution, but only when the
 * resolution was non-obvious — i.e. the coordinate was snapped to a different
 * anchor, or the evidence was structural rather than semantic. Exact
 * name-anchor hits resolved from semantic evidence stay quiet.
 */
function renderAnchoredResolutionNote(t: TargetStoreEntry): string | null {
  const r = t.resolution;
  if (!r) return null;
  const degraded = r.source !== "semantic";
  if (!r.snapped && !degraded) return null;

  const req = `${r.requested.line}:${r.requested.character}`;
  const res = `${r.resolved.line}:${r.resolved.character}`;
  if (r.snapped) {
    return `_Note: snapped from requested coordinate ${req} to name anchor ${res} (evidence: ${r.source})._`;
  }
  return `_Note: resolved from ${r.source} evidence; confirm with \`code_inspect\` if you need point-level facts._`;
}

/** Render the single-target resolved block (with optional provenance note). */
function renderSingleTarget(t: TargetStoreEntry, confidence: string, cwd: string): string[] {
  const relFile = relative(cwd, t.file) || t.file;
  const kind = t.kind ? ` \`${t.kind}\`` : "";
  const name = t.name ? ` **${t.name}**${kind}` : "";
  const lines: string[] = [
    `Resolved${name}:`,
    "",
    `- File: \`${relFile}\``,
    `- Line: ${t.displayLine}, Column: ${t.displayCharacter}`,
    `- Target ID: \`${t.targetId}\``,
    `- Span ID: \`${t.spanId}\``,
    `- Confidence: \`${confidence}\``,
    `- Provenance: \`${t.provenance}\``,
  ];
  const note = renderAnchoredResolutionNote(t);
  if (note) {
    lines.push("");
    lines.push(note);
  }
  lines.push("");
  return lines;
}

/** Render a full resolve service result into markdown. */
export function renderResolveResult(result: ResolveServiceResult, cwd: string): string {
  switch (result.kind) {
    case "resolved":
      return renderResolved(result.targets, result.omittedCount, result.confidence, cwd);
    case "disambiguation":
      return renderDisambiguation(result.candidates, result.omittedCount, cwd);
    case "error":
      return result.message;
  }
}

function renderResolved(
  targets: TargetStoreEntry[],
  omittedCount: number,
  confidence: string,
  cwd: string,
): string {
  if (targets.length === 0) {
    return "No targets resolved.";
  }

  const lines: string[] = [];

  if (targets.length === 1) {
    lines.push(...renderSingleTarget(targets[0], confidence, cwd));
  } else {
    lines.push(`Resolved ${targets.length} target(s):`);
    lines.push("");

    for (const t of targets) {
      const relFile = relative(cwd, t.file) || t.file;
      const kind = t.kind ? ` (\`${t.kind}\`)` : "";
      const name = t.name ?? "(unnamed)";
      lines.push(
        `- \`${relFile}\`:${t.displayLine}:${t.displayCharacter} — **${name}**${kind} — \`${t.targetId}\``,
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
  candidates: DisambiguationCandidate[],
  omittedCount: number,
  cwd: string,
): string {
  const lines: string[] = [];

  lines.push("# Multiple matches found");
  lines.push("");
  lines.push("Resolve by file + line + character, or refine with scope/kind:");
  lines.push("");

  for (const c of candidates) {
    const relFile = relative(cwd, c.entry.file) || c.file;
    const kind = c.kind ? ` (\`${c.kind}\`)` : "";
    const container = c.container ? ` in \`${c.container}\`` : "";
    lines.push(
      `${c.rank}. **${c.name}**${kind}${container} — \`${relFile}\`:${c.line}:${c.character}`,
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
