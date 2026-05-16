// Pattern action — bounded, scope-aware text search.
// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: text and structured pattern flows share one formatter and matcher pipeline

import {
  getStructuredPatternMatches,
  isStructuredPatternKind,
  type StructuredMatch,
  type StructuredPatternResult,
} from "../pattern-structured.ts";
import type { RgMatch } from "../search-helpers.ts";
import {
  escapeRegex,
  groupByFile,
  normalizePath,
  runRipgrep,
  runRipgrepDetailed,
} from "../search-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";

/**
 * Execute the bounded text-search action.
 *
 * Public `pattern` input is treated as a literal string by default. Callers can
 * opt into raw ripgrep regex semantics with `regex: true`; malformed regex
 * patterns are surfaced as explicit user-facing errors instead of being
 * collapsed into a misleading no-match response.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: function has multiple distinct paths (validation, regex vs literal, summary vs detailed, structured vs text, zero vs results) that are clearer when explicit than when split
export async function executePatternAction(
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  if (!params.pattern) {
    return {
      content: "**Error:** `pattern` action requires a `pattern` parameter.",
      details: undefined,
    };
  }

  const maxResults = params.maxResults ?? 8;
  const contextLines = params.contextLines ?? 1;
  const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
  const relScope = params.path ?? ".";

  if (isStructuredPatternKind(params.kind)) {
    const structured = await getStructuredPatternMatches(
      { ...params, pattern: params.pattern, kind: params.kind },
      scopePath,
      cwd,
      relScope,
    );
    if (typeof structured === "string") {
      const errorDetails: SearchDetails = {
        confidence: "unavailable",
        scope: params.path ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: ["Fix the regex pattern and retry"],
      };
      return { content: structured, details: { type: "search", data: errorDetails } };
    }

    if (structured) {
      if (structured.matches.length === 0) {
        return {
          content: formatStructuredEmptyState(params.pattern, params.kind, relScope, structured),
          details: {
            type: "search",
            data: {
              confidence: "structural",
              scope: params.path ?? null,
              candidateCount: 0,
              omittedCount: structured.omittedCount,
              nextQueries: [
                "Try a broader `pattern`, or omit `kind` for plain text search",
                "Narrow `path` if the structured scan was partial",
              ],
            },
          },
        };
      }

      return {
        content: formatStructuredMatches(params.pattern, params.kind, relScope, structured),
        details: {
          type: "search",
          data: {
            confidence: "structural",
            scope: params.path ?? null,
            candidateCount: structured.matches.length,
            omittedCount: structured.omittedCount,
            nextQueries: [
              "Omit `kind` for plain text matches",
              "Use `summary: true` for broader textual distribution",
            ],
          },
        },
      };
    }
  }

  const matches = params.regex
    ? getRegexMatches({
        pattern: params.pattern,
        scopePath,
        cwd,
        maxResults,
        contextLines,
        summary: params.summary,
      })
    : runRipgrep(escapeRegex(params.pattern), scopePath, cwd, {
        maxMatches: params.summary ? undefined : maxResults * 3,
        contextLines,
        filterLowSignal: true,
      });

  if (typeof matches === "string") {
    const errorDetails: SearchDetails = {
      confidence: "unavailable",
      scope: params.path ?? null,
      candidateCount: 0,
      omittedCount: 0,
      nextQueries: ["Fix the regex pattern and retry"],
    };
    return { content: matches, details: { type: "search", data: errorDetails } };
  }

  if (matches.length === 0) {
    const emptyDetails: SearchDetails = {
      confidence: "heuristic",
      scope: params.path ?? null,
      candidateCount: 0,
      omittedCount: 0,
      nextQueries: params.regex
        ? ["Set `regex: false` for literal matching"]
        : ["Set `regex: true` for regex matching"],
    };
    return {
      content: `No matches found for \`${params.pattern}\` in \`${relScope}\`.`,
      details: { type: "search", data: emptyDetails },
    };
  }

  const content = params.summary
    ? formatPatternSummary(params.pattern, relScope, matches, maxResults)
    : formatPatternResults(params.pattern, relScope, matches, maxResults);

  const details: SearchDetails = {
    confidence: "heuristic",
    scope: params.path ?? null,
    candidateCount: matches.length,
    omittedCount: 0,
    nextQueries: params.regex
      ? ["Set `regex: false` for literal matching"]
      : ["Set `regex: true` for regex matching"],
  };
  return { content, details: { type: "search" as const, data: details } };
}

function formatStructuredEmptyState(
  pattern: string,
  kind: "definition" | "export" | "import",
  relScope: string,
  result: StructuredPatternResult,
): string {
  const lines = [`No ${kind} matches found for \`${pattern}\` in \`${relScope}\`.`];
  const partialWarning = formatPartialStructuredWarning(result);
  if (partialWarning) {
    lines.push("");
    lines.push(partialWarning);
  }
  return lines.join("\n");
}

function formatStructuredMatches(
  pattern: string,
  kind: "definition" | "export" | "import",
  relScope: string,
  result: StructuredPatternResult,
): string {
  const grouped = new Map<string, StructuredMatch[]>();
  for (const match of result.matches) {
    const group = grouped.get(match.file) ?? [];
    group.push(match);
    grouped.set(match.file, group);
  }

  const kindLabel =
    kind === "definition" ? "Definitions" : kind === "export" ? "Exports" : "Imports";
  const lines: string[] = [];
  lines.push(`# Pattern ${kindLabel}: \`${pattern}\``);
  lines.push("");
  lines.push(
    `**${result.matches.length} match${result.matches.length !== 1 ? "es" : ""}** across **${grouped.size} file${grouped.size !== 1 ? "s" : ""}** in \`${relScope}\``,
  );
  const partialWarning = formatPartialStructuredWarning(result);
  if (partialWarning) {
    lines.push(partialWarning);
  }
  lines.push("");

  if (kind === "definition" || kind === "export") {
    addDuplicateSummary(lines, result.matches);
  }

  for (const [file, fileMatches] of grouped) {
    lines.push(`### ${file}`);
    for (const match of fileMatches.slice(0, 8)) {
      lines.push(`- \`${match.name}\` (${match.kind}) L${match.line}`);
    }
    if (fileMatches.length > 8) {
      lines.push(`- _+${fileMatches.length - 8} more in this file_`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatPartialStructuredWarning(result: StructuredPatternResult): string | null {
  if (!result.partialReason || result.omittedCount <= 0) return null;

  if (result.partialReason === "timeout") {
    return `_Partial structured results — scan timed out with +${result.omittedCount} file${result.omittedCount !== 1 ? "s" : ""} omitted. Narrow \`path\` or \`pattern\` for complete coverage._`;
  }

  return `_Partial structured results — +${result.omittedCount} file${result.omittedCount !== 1 ? "s" : ""} omitted after reaching the structured scan cap. Narrow \`path\` or \`pattern\` for complete coverage._`;
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

function getRegexMatches(options: {
  pattern: string;
  scopePath: string;
  cwd: string;
  maxResults: number;
  contextLines: number;
  summary?: boolean;
}): RgMatch[] | string {
  const result = runRipgrepDetailed(options.pattern, options.scopePath, options.cwd, {
    maxMatches: options.summary ? undefined : options.maxResults * 3,
    contextLines: options.contextLines,
    filterLowSignal: true,
  });

  if (result.error) {
    return formatRegexError(options.pattern, result.error);
  }

  return result.matches;
}

function formatRegexError(pattern: string, error: string): string {
  const lines = error
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const detail =
    [...lines]
      .reverse()
      .find((line) => line.startsWith("error:"))
      ?.replace(/^error:\s*/, "") ??
    lines.at(-1) ??
    "ripgrep rejected the regex.";
  return `**Error:** Invalid regex pattern \`${pattern}\`: ${detail}`;
}

function formatPatternResults(
  pattern: string,
  relScope: string,
  matches: RgMatch[],
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# Pattern: \`${pattern}\``);
  lines.push("");
  lines.push(`**${matches.length} match${matches.length > 1 ? "es" : ""}** in \`${relScope}\``);
  lines.push("");

  const byFile = groupByFile(matches);
  let shown = 0;
  for (const [file, fileMatches] of byFile) {
    if (shown >= maxResults) break;
    lines.push(`### ${file}`);
    const renderedLines = new Set<number>();
    const matchLines = new Set(fileMatches.map((match) => match.line));
    for (const m of fileMatches.slice(0, 5)) {
      renderMatchWithContext(lines, m, renderedLines, matchLines);
    }
    if (fileMatches.length > 5) {
      lines.push(`- _+${fileMatches.length - 5} more in this file_`);
    }
    lines.push("");
    shown++;
  }

  if (byFile.size > maxResults) {
    lines.push(
      `_+${byFile.size - maxResults} more files omitted. Narrow with \`path\` or increase \`maxResults\`._`,
    );
  }

  return lines.join("\n");
}

function formatPatternSummary(
  pattern: string,
  relScope: string,
  matches: RgMatch[],
  maxResults: number,
): string {
  const byFile = groupByFile(matches);
  const byDir = new Map<string, number>();
  for (const [file] of byFile) {
    const dir = file.includes("/") ? file.split("/").slice(0, -1).join("/") : ".";
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`# Pattern Summary: \`${pattern}\``);
  lines.push("");
  lines.push(
    `**${matches.length} match${matches.length > 1 ? "es" : ""}** across **${byFile.size} file${byFile.size !== 1 ? "s" : ""}** in \`${relScope}\``,
  );
  lines.push("");

  const sortedDirs = [...byDir.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxResults);
  for (const [dir, count] of sortedDirs) {
    lines.push(`- \`${dir}/\` — ${count} file${count !== 1 ? "s" : ""}`);
  }

  if (byDir.size > maxResults) {
    lines.push(`- _+${byDir.size - maxResults} more directories_`);
  }

  lines.push("");
  return lines.join("\n");
}

function renderMatchWithContext(
  lines: string[],
  m: RgMatch,
  renderedLines: Set<number>,
  matchLines: Set<number>,
): void {
  if (m.context) {
    for (const c of m.context.filter((cx) => cx.line < m.line)) {
      if (renderedLines.has(c.line) || matchLines.has(c.line)) continue;
      lines.push(`  L${c.line}: ${c.text.slice(0, 120)}`);
      renderedLines.add(c.line);
    }
  }
  if (!renderedLines.has(m.line)) {
    lines.push(`- L${m.line}: \`${m.text.slice(0, 120)}\``);
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
