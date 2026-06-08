/**
 * Calls markdown renderer — renders outgoing structural calls.
 */

import type { CallEntry } from "../../analysis/calls/service.ts";

export function renderCallsResult(
  enclosingScopeName: string,
  calls: CallEntry[],
  relPath: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# Outgoing calls from \`${enclosingScopeName}\``);
  lines.push("");
  lines.push(
    `**${calls.length} outgoing call${calls.length > 1 ? "s" : ""}** from \`${enclosingScopeName}\` in \`${relPath}\``,
  );
  lines.push("");

  const shown = calls.slice(0, maxResults);
  for (const c of shown) {
    lines.push(`- \`${c.name}\` (L${c.line})`);
  }
  if (calls.length > maxResults) {
    lines.push(`- _+${calls.length - maxResults} more_`);
  }
  return lines.join("\n");
}
