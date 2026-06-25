/**
 * Calls markdown renderer — renders direct structural calls.
 */

import type { CallEntry } from "../../analysis/calls/service.ts";
import type { CalleeScope } from "../../analysis/relations/types.ts";
import {
  createEvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListDisclosure,
} from "../../evidence-list.ts";

export // biome-ignore lint/complexity/useMaxParams: renderer needs target data + depth
function renderCallsResult(
  enclosingScope: CalleeScope,
  calls: CallEntry[],
  relPath: string,
  maxResults: number,
  depth: "direct" | "deep" = "direct",
): { content: string; evidenceList: EvidenceListMetadata | null } {
  const lines: string[] = [];
  const depthLabel = depth === "deep" ? "Deep structural calls" : "Direct structural calls";
  const depthNote =
    depth === "deep"
      ? "_Deep: includes calls from nested function/method/callback scopes within the enclosing scope._"
      : "_Structural only: call expressions are reported by source shape, not symbol identity; calls inside nested function/method/callback scopes are excluded from this enclosing scope._";

  lines.push(`# ${depthLabel} from \`${enclosingScope.name}\``);
  lines.push("");
  lines.push(
    `**${calls.length} ${depth === "deep" ? "" : "direct "}structural call${calls.length !== 1 ? "s" : ""}** from enclosing scope \`${enclosingScope.name}\` (${formatScopeRange(enclosingScope)}) in \`${relPath}\``,
  );
  lines.push("");
  lines.push(depthNote);
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
