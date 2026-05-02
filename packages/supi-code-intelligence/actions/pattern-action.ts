// Pattern action — bounded, scope-aware text search.

import type { RgMatch } from "../search-helpers.ts";
import { groupByFile, normalizePath, runRipgrep } from "../search-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";

export async function executePatternAction(params: ActionParams, cwd: string): Promise<string> {
  if (!params.pattern) {
    return "**Error:** `pattern` action requires a `pattern` parameter.";
  }

  const maxResults = params.maxResults ?? 8;
  const contextLines = params.contextLines ?? 1;
  const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
  const relScope = params.path ?? ".";

  const matches = runRipgrep(params.pattern, scopePath, cwd, {
    maxMatches: maxResults * 3,
    contextLines,
    filterLowSignal: true,
  });

  if (matches.length === 0) {
    return `No matches found for \`${params.pattern}\` in \`${relScope}\`.`;
  }

  return formatPatternResults(params.pattern, relScope, matches, maxResults);
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
    for (const m of fileMatches.slice(0, 5)) {
      renderMatchWithContext(lines, m);
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

function renderMatchWithContext(lines: string[], m: RgMatch): void {
  if (m.context) {
    for (const c of m.context.filter((cx) => cx.line < m.line)) {
      lines.push(`  L${c.line}: ${c.text.slice(0, 120)}`);
    }
  }
  lines.push(`- L${m.line}: \`${m.text.slice(0, 120)}\``);
  if (m.context) {
    for (const c of m.context.filter((cx) => cx.line > m.line)) {
      lines.push(`  L${c.line}: ${c.text.slice(0, 120)}`);
    }
  }
}
