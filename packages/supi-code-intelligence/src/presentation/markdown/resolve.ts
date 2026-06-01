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

    // Follow-up suggestions
    lines.push("**Next steps — use the target ID with:**");
    lines.push(
      `- \`code_context\` { targetId: "${t.targetId}", task: "..." } — task-focused context`,
    );
    lines.push(`- \`code_graph\` { targetId: "${t.targetId}" } — find usages`);
    lines.push(
      `- \`code_graph\` { targetId: "${t.targetId}", relations: ["callees"] } — outgoing calls`,
    );
    lines.push(`- \`code_impact\` { targetId: "${t.targetId}" } — blast radius`);
    lines.push(
      `- \`code_inspect\` { file: "${t.file}", line: ${t.displayLine}, character: ${t.displayCharacter} } — factual point inspection`,
    );
    lines.push(
      `- \`code_refactor\` { targetId: "${t.targetId}", operation: "rename_symbol", newName: "..." } — preview a safe rename plan`,
    );
    lines.push(`- \`code_context\` { targetId: "${t.targetId}" } — orientation`);
  } else {
    lines.push(
      `Resolved ${targets.length} target(s)${omittedCount > 0 ? ` (${omittedCount} omitted)` : ""}:`,
    );
    lines.push("");

    for (const t of targets) {
      const kind = t.kind ? ` (\`${t.kind}\`)` : "";
      const name = t.name ?? "(unnamed)";
      lines.push(
        `- \`${t.file}\`:${t.displayLine}:${t.displayCharacter} — **${name}**${kind} — \`${t.targetId}\``,
      );
    }

    lines.push("");
    lines.push(
      "**Use a `targetId` with** `code_context`, `code_graph`, `code_impact`, or `code_refactor`, and use `code_inspect` with file + line + character for point facts.",
    );
  }

  return lines.join("\n");
}

function renderDisambiguation(
  candidates: DisambiguationCandidateEntry[],
  omittedCount: number,
): string {
  const lines: string[] = [];
  const omitNote = omittedCount > 0 ? ` (+${omittedCount} more)` : "";

  lines.push(`# Multiple matches found${omitNote}`);
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

  lines.push("");
  if (candidates.length > 0) {
    const first = candidates[0];
    lines.push("**Next steps:**");
    lines.push(
      `1. Rerun \`code_resolve\` with anchored coords: \`{ file: "${first.file}", line: ${first.line}, character: ${first.character} }\``,
    );
    lines.push(
      `2. Or use a candidate's \`targetId\` directly with \`code_context\`, \`code_graph\`, \`code_refactor\`, etc.`,
    );
  }

  return lines.join("\n");
}
