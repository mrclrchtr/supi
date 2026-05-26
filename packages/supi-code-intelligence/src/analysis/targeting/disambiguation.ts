/**
 * Disambiguation formatting for target resolution.
 *
 * Provides a single place for formatting disambiguation outcomes
 * from the targeting pipeline into user-facing messages.
 */

import type { TargetOutcome } from "../../targeting/types.ts";

/**
 * Format disambiguation candidates into a user-facing message.
 */
export function formatDisambiguationMessage(
  symbol: string,
  outcome: Extract<TargetOutcome, { kind: "disambiguation" }>,
): string {
  const lines: string[] = [];
  lines.push(`# Disambiguation needed for \`${symbol}\``);
  lines.push("");
  const omitNote = outcome.omittedCount > 0 ? ` (+${outcome.omittedCount} more)` : "";
  lines.push(
    `Found ${outcome.candidates.length} candidates${omitNote}. Rerun with anchored coordinates:`,
  );
  lines.push("");

  for (const c of outcome.candidates) {
    const kind = c.kind ? ` (${c.kind})` : "";
    const container = c.container ? ` in ${c.container}` : "";
    lines.push(
      `${c.rank}. **${c.name}**${kind}${container} — \`${c.file}\`:${c.line}:${c.character}`,
    );
  }

  lines.push("");
  if (outcome.candidates.length > 0) {
    const first = outcome.candidates[0];
    lines.push(
      `Example: rerun with \`file: "${first.file}"\`, \`line: ${first.line}\`, and \`character: ${first.character}\`.`,
    );
  }

  return lines.join("\n");
}
