/** Calls markdown renderer — renders assembled structural-call evidence. */

import {
  type EvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import type { CallEntry, CalleeScope } from "../../analysis/relations/types.ts";

export function renderCallsResult(
  enclosingScope: CalleeScope,
  calls: EvidenceList<CallEntry>,
  relPath: string,
  depth: "direct" | "deep" = "direct",
): { content: string; evidenceList: EvidenceListMetadata } {
  const lines: string[] = [];
  const depthLabel = depth === "deep" ? "Deep structural calls" : "Direct structural calls";
  const depthNote =
    depth === "deep"
      ? "_Deep: includes calls from nested function/method/callback scopes within the enclosing scope._"
      : "_Structural only: call expressions are reported by source shape, not symbol identity; calls inside nested function/method/callback scopes are excluded from this enclosing scope._";
  const total = calls.metadata.totalCount ?? calls.metadata.shownCount;

  lines.push(`# ${depthLabel} from \`${enclosingScope.name}\``, "");
  lines.push(
    `**${total} ${depth === "deep" ? "" : "direct "}structural call${total === 1 ? "" : "s"}** from enclosing scope \`${enclosingScope.name}\` (${formatScopeRange(enclosingScope)}) in \`${relPath}\``,
    "",
    depthNote,
    "",
  );

  for (const call of calls.items) lines.push(`- \`${call.name}\` (L${call.line})`);
  const disclosure = renderEvidenceListMetadataDisclosure(calls.metadata);
  if (disclosure) lines.push(disclosure);
  return { content: lines.join("\n"), evidenceList: calls.metadata };
}

function formatScopeRange(scope: CalleeScope): string {
  if (scope.startLine === scope.endLine) return `L${scope.startLine}`;
  return `L${scope.startLine}–L${scope.endLine}`;
}
