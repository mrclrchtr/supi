// Pattern action — bounded, scope-aware text search.

import type { RgMatch } from "../search-helpers.ts";
import {
  escapeRegex,
  groupByFile,
  normalizePath,
  runRipgrep,
  runRipgrepDetailed,
} from "../search-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";

/**
 * Execute the bounded text-search action.
 *
 * Public `pattern` input is treated as a literal string by default. Callers can
 * opt into raw ripgrep regex semantics with `regex: true`; malformed regex
 * patterns are surfaced as explicit user-facing errors instead of being
 * collapsed into a misleading no-match response.
 */
export async function executePatternAction(params: ActionParams, cwd: string): Promise<string> {
  if (!params.pattern) {
    return "**Error:** `pattern` action requires a `pattern` parameter.";
  }

  const maxResults = params.maxResults ?? 8;
  const contextLines = params.contextLines ?? 1;
  const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
  const relScope = params.path ?? ".";

  const matches = params.regex
    ? getRegexMatches({
        pattern: params.pattern,
        scopePath,
        cwd,
        maxResults,
        contextLines,
      })
    : runRipgrep(escapeRegex(params.pattern), scopePath, cwd, {
        maxMatches: params.summary ? undefined : maxResults * 3,
        contextLines,
        filterLowSignal: true,
      });

  if (typeof matches === "string") {
    return matches;
  }

  if (matches.length === 0) {
    return `No matches found for \`${params.pattern}\` in \`${relScope}\`.`;
  }

  if (params.summary) {
    return formatPatternSummary(params.pattern, relScope, matches, maxResults);
  }

  return formatPatternResults(params.pattern, relScope, matches, maxResults);
}

function getRegexMatches(options: {
  pattern: string;
  scopePath: string;
  cwd: string;
  maxResults: number;
  contextLines: number;
}): RgMatch[] | string {
  const result = runRipgrepDetailed(options.pattern, options.scopePath, options.cwd, {
    maxMatches: options.maxResults * 3,
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
