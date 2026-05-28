// Relations markdown renderer — consumes use-case data and produces markdown content.

import { isInProjectPath, uriToFile } from "../../search-helpers.ts";
import type { ReferenceCollection } from "../../use-case/support/semantic-references.ts";
import { formatReferenceList } from "../../use-case/support/semantic-references.ts";

// ── Callers ──────────────────────────────────────────────────────────

export function renderCallersResult(
  symbolName: string,
  result: ReferenceCollection,
  cwd: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# Callers of \`${symbolName}\``);
  lines.push("");
  lines.push(
    `**${result.refs.length} reference${result.refs.length !== 1 ? "s" : ""}** (${result.confidence})`,
  );
  if (result.externalCount > 0) {
    lines.push(
      `_+${result.externalCount} external reference${result.externalCount !== 1 ? "s" : ""}_`,
    );
  }
  lines.push("");

  formatReferenceList(lines, result.refs, maxResults, cwd);
  return lines.join("\n");
}

// ── Implementations ──────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: implementation rendering with project/external splitting and formatting is clearer as one function
export function renderImplementationsResult(
  locations: Array<{
    uri?: string;
    targetUri?: string;
    range?: { start: { line: number } };
    targetRange?: { start: { line: number } };
    targetSelectionRange?: { start: { line: number } };
  }>,
  cwd: string,
  maxResults: number,
): string {
  const projectLocs = locations.filter((loc) => {
    const uri = loc.uri ?? loc.targetUri ?? "";
    const filePath = uriToFile(uri);
    return filePath && isInProjectPath(filePath, cwd);
  });
  const externalLocs = locations.filter((loc) => {
    const uri = loc.uri ?? loc.targetUri ?? "";
    const filePath = uriToFile(uri);
    return !filePath || !isInProjectPath(filePath, cwd);
  });

  const lines: string[] = [];
  lines.push("# Implementations (semantic)");
  lines.push("");
  if (projectLocs.length > 0) {
    lines.push(
      `**${projectLocs.length} implementation${projectLocs.length !== 1 ? "s" : ""}** in the project`,
    );
    lines.push("");
    for (const loc of projectLocs.slice(0, maxResults)) {
      const uri = loc.uri ?? loc.targetUri ?? "";
      const filePath = uriToFile(uri);
      const range = loc.targetSelectionRange ?? loc.targetRange ?? loc.range;
      if (filePath && range) {
        lines.push(`- \`${filePath}:${(range as { start: { line: number } }).start.line + 1}\``);
      } else if (filePath) {
        lines.push(`- \`${filePath}\``);
      }
    }
    lines.push("");
  }

  if (externalLocs.length > 0) {
    lines.push(
      `_+${externalLocs.length} external location${externalLocs.length !== 1 ? "s" : ""} (outside this project)_`,
    );
    lines.push("");
  }

  lines.push(
    "_Semantic analysis. Use `code_find` (text mode) only when you explicitly want text-search hints for likely implementations._",
  );
  lines.push("");

  return lines.join("\n");
}

// ── Callees ──────────────────────────────────────────────────────────

export function renderCalleesResult(
  data: { enclosingScope: { name: string }; callees: Array<{ name: string; startLine: number }> },
  relPath: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# Callees of \`${data.enclosingScope.name}\` (structural)`);
  lines.push("");
  lines.push(
    `**${data.callees.length} outgoing call${data.callees.length > 1 ? "s" : ""}** from \`${data.enclosingScope.name}\` in \`${relPath}\``,
  );
  lines.push("");

  const shown = data.callees.slice(0, maxResults);
  for (const c of shown) {
    lines.push(`- \`${c.name}\` (L${c.startLine})`);
  }
  if (data.callees.length > maxResults) {
    lines.push(`- _+${data.callees.length - maxResults} more_`);
  }
  lines.push("");
  lines.push(
    "_Structural analysis — may include unresolved or qualified names. Use `code_brief` with `file`, `line`, and `character` for precise type information._",
  );
  lines.push("");
  return lines.join("\n");
}
