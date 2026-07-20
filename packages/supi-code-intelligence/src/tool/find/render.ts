/** Markdown adapter for assembled code_find outcomes. */

import {
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import type { FindResultAssembly } from "../result/find.ts";
import { renderStructuredEmptyState, renderStructuredMatches } from "./markdown.ts";

export function renderFindResult(assembly: FindResultAssembly): string {
  const { outcome } = assembly;
  const evidence = assembly.assembled.evidenceLists[0];
  if (!evidence) return "**Unavailable:** Search evidence metadata was not assembled.";

  const content =
    outcome.data.kind === "semantic"
      ? renderSemantic(assembly, evidence)
      : outcome.data.result.matches.length === 0
        ? renderStructuredEmptyState({
            pattern: outcome.query,
            kind: outcome.data.astKind,
            relScope: outcome.scopeLabel,
            result: outcome.data.result,
            evidenceMetadata: evidence,
          })
        : renderStructuredMatches(
            outcome.query,
            outcome.data.astKind,
            outcome.scopeLabel,
            outcome.data.result,
            evidence,
          ).content;

  return `**Confidence:** \`${assembly.assembled.confidence}\`\n\n${content}`;
}

function renderSemantic(assembly: FindResultAssembly, evidence: EvidenceListMetadata): string {
  const { outcome } = assembly;
  if (outcome.data.kind !== "semantic") return "";
  const symbols = outcome.data.symbols;
  if (symbols.length === 0) {
    return `**Semantic search** — \`${outcome.query}\`\n\nNo semantic results found in \`${outcome.scopeLabel}\`.`;
  }

  const lines = [
    `**Semantic search** — \`${outcome.query}\` (${symbols.length} symbol${symbols.length === 1 ? "" : "s"} found)`,
  ];
  for (const symbol of symbols.slice(0, evidence.shownCount)) {
    const kind = symbol.kind ? ` [${symbol.kind}]` : "";
    const container = symbol.container ? ` (in ${symbol.container})` : "";
    const anchor = symbol.nameAnchor ?? symbol.declarationAnchor;
    lines.push(`- \`${symbol.name}\`${kind}${container} — \`${symbol.file}:${anchor.line}\``);
  }
  const disclosure = renderEvidenceListMetadataDisclosure(evidence);
  if (disclosure) lines.push(disclosure);
  return lines.join("\n");
}
