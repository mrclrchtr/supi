/**
 * Calls markdown renderer — renders outgoing structural calls.
 */

import type { CallEntry } from "../../analysis/calls/service.ts";
import {
  createEvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListDisclosure,
} from "../../evidence-list.ts";

export function renderCallsResult(
  enclosingScopeName: string,
  calls: CallEntry[],
  relPath: string,
  maxResults: number,
): { content: string; evidenceList: EvidenceListMetadata | null } {
  const lines: string[] = [];
  lines.push(`# Outgoing calls from \`${enclosingScopeName}\``);
  lines.push("");
  lines.push(
    `**${calls.length} outgoing call${calls.length > 1 ? "s" : ""}** from \`${enclosingScopeName}\` in \`${relPath}\``,
  );
  lines.push("");

  const evidence = createEvidenceList({
    key: "callees.calls",
    items: calls,
    maxResults,
  });
  for (const c of evidence.items) {
    lines.push(`- \`${c.name}\` (L${c.line})`);
  }
  const disclosure = renderEvidenceListDisclosure(evidence);
  if (disclosure) {
    lines.push(disclosure);
  }
  return { content: lines.join("\n"), evidenceList: evidence.metadata };
}
