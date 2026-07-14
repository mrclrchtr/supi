/** Markdown adapter for assembled code_find outcomes. */

import {
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import type { FindResultAssembly } from "../result/find.ts";
import {
  renderPatternResults,
  renderStructuredEmptyState,
  renderStructuredMatches,
} from "./markdown.ts";

export function renderFindResult(assembly: FindResultAssembly): string {
  const { outcome } = assembly;
  const evidence = assembly.assembled.evidenceLists[0];
  if (!evidence) return "**Unavailable:** Search evidence metadata was not assembled.";

  const content = (() => {
    switch (outcome.data.kind) {
      case "text":
      case "regex":
        return renderTextOrRegexResult(assembly, evidence);
      case "ast":
        if (outcome.data.result.matches.length === 0) {
          return renderStructuredEmptyState(
            outcome.query,
            outcome.data.astKind,
            outcome.scopeLabel,
            undefined,
            outcome.data.result,
          );
        }
        return renderStructuredMatches(
          outcome.query,
          outcome.data.astKind,
          outcome.scopeLabel,
          outcome.data.result,
          evidence,
        ).content;
      case "semantic":
        return renderSemantic(assembly, evidence);
    }
  })();

  return `**Confidence:** \`${assembly.assembled.confidence}\`\n\n${content}`;
}

function renderTextOrRegexResult(
  assembly: FindResultAssembly,
  evidence: EvidenceListMetadata,
): string {
  const { outcome } = assembly;
  if (outcome.data.kind !== "text" && outcome.data.kind !== "regex") return "";
  if (outcome.data.matches.length === 0) {
    const disclosure = renderEvidenceListMetadataDisclosure(evidence);
    return disclosure
      ? `No matches were collected for \`${outcome.query}\` in \`${outcome.scopeLabel}\`.\n\n${disclosure}`
      : `No matches found for \`${outcome.query}\` in \`${outcome.scopeLabel}\`.`;
  }
  return renderPatternResults(
    outcome.query,
    outcome.scopeLabel,
    [...outcome.data.matches],
    evidence,
  ).content;
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
