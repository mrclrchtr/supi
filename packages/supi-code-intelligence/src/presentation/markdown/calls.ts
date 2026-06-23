/**
 * Calls markdown renderer — renders outgoing structural calls.
 */

import type { CallEntry } from "../../analysis/calls/service.ts";
import type { CalleeScope } from "../../analysis/relations/types.ts";
import {
  createEvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListDisclosure,
} from "../../evidence-list.ts";

export function renderCallsResult(
  enclosingScope: CalleeScope,
  calls: CallEntry[],
  relPath: string,
  maxResults: number,
): { content: string; evidenceList: EvidenceListMetadata | null } {
  const lines: string[] = [];
  lines.push(`# Direct structural calls from \`${enclosingScope.name}\``);
  lines.push("");
  lines.push(
    `**${calls.length} direct structural call${calls.length !== 1 ? "s" : ""}** from enclosing scope \`${enclosingScope.name}\` (${formatScopeRange(enclosingScope)}) in \`${relPath}\``,
  );
  lines.push("");
  lines.push(
    "_Structural only: call expressions are reported by source shape, not symbol identity; calls inside nested function/method/callback scopes are excluded from this enclosing scope._",
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

function formatScopeRange(scope: CalleeScope): string {
  if (scope.startLine === scope.endLine) return `L${scope.startLine}`;
  return `L${scope.startLine}–L${scope.endLine}`;
}
