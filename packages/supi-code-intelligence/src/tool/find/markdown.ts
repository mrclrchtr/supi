// AST search Markdown rendering.

import {
  type EvidenceListMetadata,
  renderEvidenceListMetadataDisclosure,
} from "../../analysis/evidence.ts";
import type {
  StructuredMatch,
  StructuredPatternResult,
  StructuredScanLimitation,
} from "../../analysis/search/pattern.ts";
import { CODE_FIND_AST_KIND_LABELS, type CodeFindAstKind } from "./ast-kinds.ts";

export function renderStructuredEmptyState(options: {
  pattern: string;
  kind: CodeFindAstKind;
  relScope: string;
  result: StructuredPatternResult;
  evidenceMetadata: EvidenceListMetadata;
}): string {
  const lines = [
    options.result.scan.complete
      ? `No ${options.kind} matches found for \`${options.pattern}\` in \`${options.relScope}\`.`
      : `No ${options.kind} matches were collected for \`${options.pattern}\` in \`${options.relScope}\`.`,
  ];
  appendScanAndFailures(lines, options.result);
  const disclosure = renderEvidenceListMetadataDisclosure(options.evidenceMetadata);
  if (disclosure) lines.push("", disclosure);
  return lines.join("\n");
}

function renderFailureSummary(failures: readonly { file: string; reason: string }[]): string[] {
  if (failures.length === 0) return [];
  const lines: string[] = [
    `**${failures.length} file${failures.length === 1 ? "" : "s"} could not be analyzed:**`,
  ];
  for (const failure of failures.slice(0, 5)) {
    lines.push(`- \`${failure.file}\` — ${failure.reason}`);
  }
  if (failures.length > 5) lines.push(`- _+${failures.length - 5} more_`);
  return lines;
}

function renderScanLimitations(limitations: readonly StructuredScanLimitation[]): string | null {
  if (limitations.length === 0) return null;
  const descriptions = limitations.map((limitation) => {
    const count =
      limitation.pathCount === null
        ? "unknown paths"
        : `${limitation.pathCount} path${limitation.pathCount === 1 ? "" : "s"}`;
    return `${limitation.reason}: ${count}`;
  });
  return `_AST Scan incomplete — ${descriptions.join("; ")}. Match total is unknown._`;
}

function appendScanAndFailures(lines: string[], result: StructuredPatternResult): void {
  const operationExclusion = result.scan.exclusions.find(
    (exclusion) => exclusion.reason === "unsupported-operation",
  );
  if (operationExclusion) {
    const count = operationExclusion.pathCount;
    lines.push(
      "",
      `_AST Scan policy excluded ${count} file${count === 1 ? "" : "s"} because ${result.scan.policy.operation} analysis is not supported for their language._`,
    );
  }
  const scanWarning = renderScanLimitations(result.scan.limitations);
  if (scanWarning) lines.push("", scanWarning);
  const failureLines = renderFailureSummary(result.failures);
  if (failureLines.length > 0) lines.push("", ...failureLines);
}

// biome-ignore lint/complexity/useMaxParams: renderer mirrors the public evidence inputs
export function renderStructuredMatches(
  pattern: string,
  kind: CodeFindAstKind,
  relScope: string,
  result: StructuredPatternResult,
  evidenceMetadata: EvidenceListMetadata,
): { content: string; evidenceList: EvidenceListMetadata } {
  const shownMatches = result.matches.slice(0, evidenceMetadata.shownCount);
  const grouped = groupMatches(shownMatches);
  const matchedFiles = groupMatches(result.matches);
  const kindLabel = CODE_FIND_AST_KIND_LABELS[kind];
  const matchCount =
    evidenceMetadata.totalCount === null
      ? `At least ${result.matches.length} collected match${result.matches.length === 1 ? "" : "es"}`
      : `${result.matches.length} match${result.matches.length === 1 ? "" : "es"}`;
  const lines = [
    `# Pattern ${kindLabel}: \`${pattern}\``,
    "",
    `**${matchCount}** across **${matchedFiles.size} file${matchedFiles.size === 1 ? "" : "s"}** in \`${relScope}\``,
  ];

  if (kind === "call") {
    lines.push(
      "",
      '_Note: AST call results are name-based, not symbol-identity-aware. Use `code_graph` with `relations: ["references"]` on a resolved target for identity-aware callers._',
    );
  }
  appendScanAndFailures(lines, result);
  lines.push("");

  if (kind === "definition" || kind === "export") addDuplicateSummary(lines, shownMatches);
  for (const [file, fileMatches] of grouped) {
    lines.push(`### ${file}`);
    for (const match of fileMatches) {
      lines.push(`- \`${match.name}\` (${match.kind}) L${match.line}`);
    }
    lines.push("");
  }

  const disclosure = renderEvidenceListMetadataDisclosure(evidenceMetadata);
  if (disclosure) lines.push(disclosure);
  return { content: lines.join("\n"), evidenceList: evidenceMetadata };
}

function groupMatches(matches: readonly StructuredMatch[]): Map<string, StructuredMatch[]> {
  const grouped = new Map<string, StructuredMatch[]>();
  for (const match of matches) {
    const group = grouped.get(match.file) ?? [];
    group.push(match);
    grouped.set(match.file, group);
  }
  return grouped;
}

function addDuplicateSummary(lines: string[], matches: readonly StructuredMatch[]): void {
  const byName = new Map<string, Set<string>>();
  for (const match of matches) {
    const files = byName.get(match.name) ?? new Set<string>();
    files.add(match.file);
    byName.set(match.name, files);
  }

  const duplicates = [...byName.entries()]
    .map(([name, files]) => ({ name, files: [...files].sort((a, b) => a.localeCompare(b)) }))
    .filter((entry) => entry.files.length > 1)
    .sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
  if (duplicates.length === 0) return;

  lines.push("## Duplicate Definitions");
  for (const duplicate of duplicates.slice(0, 8)) {
    lines.push(
      `- \`${duplicate.name}\` — defined in ${duplicate.files.length} files: ${duplicate.files
        .map((file) => `\`${file}\``)
        .join(", ")}`,
    );
  }
  if (duplicates.length > 8) lines.push(`- _+${duplicates.length - 8} more duplicates_`);
  lines.push("");
}
