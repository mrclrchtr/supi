// Pattern search markdown renderer — all formatting for literal, regex, and structured search results.

import type { StructuralProvider as StructuralSubstrate } from "@mrclrchtr/supi-code-runtime/api";
import {
  createEvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListDisclosure,
} from "../../evidence-list.ts";
import type {
  StructuredMatch,
  StructuredPatternKind,
  StructuredPatternResult,
} from "../../pattern-structured.ts";
import type { RgMatch } from "../../search-helpers.ts";
import { groupByFile } from "../../search-helpers.ts";

// ── Structured search formatting ─────────────────────────────────────

// biome-ignore lint/complexity/useMaxParams: structured empty-state with optional result parameter keeps partial-warning logic together
export function renderStructuredEmptyState(
  pattern: string,
  kind: StructuredPatternKind,
  relScope: string,
  _structural?: StructuralSubstrate,
  result?: StructuredPatternResult,
): string {
  const lines = [`No ${kind} matches found for \`${pattern}\` in \`${relScope}\`.`];
  const partial = renderPartialWarning(result);
  if (partial) {
    lines.push("");
    lines.push(partial);
  }
  const failureLines = renderFailureSummary(result?.failures);
  if (failureLines.length > 0) {
    lines.push("");
    lines.push(...failureLines);
  }
  return lines.join("\n");
}

function renderFailureSummary(failures?: Array<{ file: string; reason: string }>): string[] {
  if (!failures || failures.length === 0) return [];
  const lines: string[] = [
    `**${failures.length} file${failures.length !== 1 ? "s" : ""} could not be analyzed:**`,
  ];
  for (const f of failures.slice(0, 5)) {
    lines.push(`- \`${f.file}\` — ${f.reason}`);
  }
  if (failures.length > 5) {
    lines.push(`- _+${failures.length - 5} more_`);
  }
  return lines;
}

function renderPartialWarning(result?: StructuredPatternResult): string | null {
  if (!result || result.omittedCount <= 0 || !result.partialReason) return null;
  if (result.partialReason === "timeout") {
    return `_Partial structured results — scan timed out with +${result.omittedCount} file${result.omittedCount !== 1 ? "s" : ""} omitted. Narrow \`path\` or \`pattern\` for complete coverage._`;
  }
  return `_Partial structured results — +${result.omittedCount} file${result.omittedCount !== 1 ? "s" : ""} omitted after reaching the structured scan cap. Narrow \`path\` or \`pattern\` for complete coverage._`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pattern search rendering groups matches by file and adds summaries — each branch stays linear
// biome-ignore lint/complexity/useMaxParams: structured renderer mirrors the existing public helper shape plus display cap
export function renderStructuredMatches(
  pattern: string,
  kind: StructuredPatternKind,
  relScope: string,
  result: StructuredPatternResult,
  maxResults: number,
): { content: string; evidenceList: EvidenceListMetadata } {
  const evidence = createEvidenceList({
    key: "find.astMatches",
    items: result.matches,
    maxResults,
  });
  const grouped = new Map<string, StructuredMatch[]>();
  for (const match of evidence.items) {
    const group = grouped.get(match.file) ?? [];
    group.push(match);
    grouped.set(match.file, group);
  }

  const kindLabel =
    kind === "definition"
      ? "Definitions"
      : kind === "export"
        ? "Exports"
        : kind === "import"
          ? "Imports"
          : kind === "call"
            ? "Calls"
            : kind === "type"
              ? "Types"
              : kind === "interface"
                ? "Interfaces"
                : "Tests";
  const lines: string[] = [];
  lines.push(`# Pattern ${kindLabel}: \`${pattern}\``);
  lines.push("");
  lines.push(
    `**${result.matches.length} match${result.matches.length !== 1 ? "es" : ""}** across **${grouped.size} file${grouped.size !== 1 ? "s" : ""}** in \`${relScope}\``,
  );
  const partialWarning = renderPartialWarning(result);
  if (partialWarning) {
    lines.push(partialWarning);
  }
  if (result.failures.length > 0) {
    lines.push("");
    lines.push(...renderFailureSummary(result.failures));
  }
  lines.push("");

  if (kind === "definition" || kind === "export") {
    addDuplicateSummary(lines, result.matches);
  }

  for (const [file, fileMatches] of grouped) {
    lines.push(`### ${file}`);
    for (const match of fileMatches) {
      lines.push(`- \`${match.name}\` (${match.kind}) L${match.line}`);
    }
    lines.push("");
  }

  const disclosure = renderEvidenceListDisclosure(evidence);
  if (disclosure) {
    lines.push(disclosure);
  }

  return { content: lines.join("\n"), evidenceList: evidence.metadata };
}

function addDuplicateSummary(lines: string[], matches: StructuredMatch[]): void {
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
  if (duplicates.length > 8) {
    lines.push(`- _+${duplicates.length - 8} more duplicates_`);
  }
  lines.push("");
}

// ── Text search formatting ──────────────────────────────────────────

export function renderRegexError(pattern: string, error: string): string {
  const errLines = error
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const detail =
    [...errLines]
      .reverse()
      .find((line) => line.startsWith("error:"))
      ?.replace(/^error:\s*/, "") ??
    errLines.at(-1) ??
    "ripgrep rejected the regex.";
  return `**Error:** Invalid regex pattern \`${pattern}\`: ${detail}`;
}

export function renderPatternResults(
  pattern: string,
  relScope: string,
  matches: RgMatch[],
  maxResults: number,
): { content: string; evidenceList: EvidenceListMetadata } {
  const lines: string[] = [];
  lines.push(`# Pattern: \`${pattern}\``);
  lines.push("");
  lines.push(`**${matches.length} match${matches.length > 1 ? "es" : ""}** in \`${relScope}\``);
  lines.push("");

  const evidence = createEvidenceList({
    key: "find.textMatches",
    items: matches,
    maxResults,
  });
  const byFile = groupByFile(evidence.items);
  for (const [file, fileMatches] of byFile) {
    lines.push(`### ${file}`);
    const renderedLines = new Set<number>();
    const matchLines = new Set(fileMatches.map((match) => match.line));
    for (const m of fileMatches) {
      renderMatchWithContext(lines, m, renderedLines, matchLines, pattern);
    }
    lines.push("");
  }

  const disclosure = renderEvidenceListDisclosure(evidence);
  if (disclosure) {
    lines.push(disclosure);
  }
  lines.push("");
  return { content: lines.join("\n"), evidenceList: evidence.metadata };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: context-line rendering with before/after/skip logic is clearer as one function
// biome-ignore lint/complexity/useMaxParams: options-object refactor would reduce readability for this rendering helper
function renderMatchWithContext(
  lines: string[],
  m: RgMatch,
  renderedLines: Set<number>,
  matchLines: Set<number>,
  _pattern: string,
): void {
  if (m.context) {
    for (const c of m.context.filter((cx) => cx.line < m.line)) {
      if (renderedLines.has(c.line) || matchLines.has(c.line)) continue;
      lines.push(`  L${c.line}: ${c.text.slice(0, 120)}`);
      renderedLines.add(c.line);
    }
  }
  if (!renderedLines.has(m.line)) {
    lines.push(`- L${m.line}: \`${(m.text || "").slice(0, 120)}\``);
    renderedLines.add(m.line);
  }
  if (m.context) {
    for (const c of m.context.filter((cx) => cx.line > m.line)) {
      if (renderedLines.has(c.line) || matchLines.has(c.line)) continue;
      lines.push(`  L${c.line}: ${c.text.slice(0, 120)}`);
      renderedLines.add(c.line);
    }
  }
}

export function renderPatternSummary(
  pattern: string,
  relScope: string,
  matches: RgMatch[],
  maxResults: number,
): string {
  const byFile = groupByFile(matches);
  const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);

  const lines: string[] = [];
  lines.push(`# Pattern Summary: \`${pattern}\``);
  lines.push("");
  lines.push(
    `**${matches.length} match${matches.length > 1 ? "es" : ""}** across **${byFile.size} file${byFile.size > 1 ? "s" : ""}** in \`${relScope}\``,
  );
  lines.push("");

  for (const [file, fileMatches] of sorted.slice(0, maxResults)) {
    const lineNums = [...new Set(fileMatches.map((m) => m.line))].sort((a, b) => a - b).slice(0, 3);
    const extra = fileMatches.length > 3 ? ` (+${fileMatches.length - 3} more)` : "";
    const linesStr = lineNums.join(", ");
    lines.push(
      `- \`${file}\` — ${fileMatches.length} match${fileMatches.length > 1 ? "es" : ""}${linesStr ? ` at L${linesStr}` : ""}${extra}`,
    );
  }

  if (sorted.length > maxResults) {
    lines.push(`- _+${sorted.length - maxResults} more files omitted_`);
  }
  lines.push("");
  return lines.join("\n");
}
