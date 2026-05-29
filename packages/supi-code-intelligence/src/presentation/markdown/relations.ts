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

// ── Combined graph ───────────────────────────────────────────────────

/** Relation families accepted by code_graph. */
export type GraphRelationKind =
  | "references"
  | "callees"
  | "imports"
  | "exports"
  | "implements"
  | "tests";

/** A section in the combined graph output. */
export type GraphSection =
  | { kind: "ok"; rel: GraphRelationKind; count: number; content: string }
  | { kind: "unavailable"; rel: GraphRelationKind; message: string }
  | { kind: "not-implemented"; rel: GraphRelationKind; message: string };

/**
 * Render a combined graph result from multiple relation sections.
 *
 * Produces a unified markdown output with a summary header, per-section
 * pre-rendered content, and a footer with follow-up hints.
 */
export function renderGraphResult(
  displayName: string,
  sections: GraphSection[],
  resolvedFile: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Graph of \`${displayName}\``);
  lines.push("");
  lines.push(`_File: \`${resolvedFile}\`_`);
  lines.push("");

  // Summary
  const okSections = sections.filter((s) => s.kind === "ok") as Extract<
    GraphSection,
    { kind: "ok" }
  >[];
  const unavailable = sections.filter((s) => s.kind === "unavailable");
  const notImpl = sections.filter((s) => s.kind === "not-implemented");

  if (okSections.length > 0) {
    const parts = okSections.map(
      (s) => `**${s.rel}**: ${s.count} result${s.count !== 1 ? "s" : ""}`,
    );
    lines.push(parts.join(" | "));
    lines.push("");
  }
  if (unavailable.length > 0) {
    const names = unavailable.map((s) => `\`${s.rel}\``).join(", ");
    lines.push(`_Unavailable: ${names}_`);
    lines.push("");
  }
  if (notImpl.length > 0) {
    const names = notImpl.map((s) => `\`${s.rel}\``).join(", ");
    lines.push(`_Not yet implemented: ${names}_`);
    lines.push("");
  }

  // Per-section content
  for (const section of sections) {
    if (section.kind === "ok") {
      lines.push(section.content);
      lines.push("");
    }
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(
    "_Use `code_brief` on individual results for type or definition context. Use `code_affected` for impact analysis._",
  );

  return lines.join("\n");
}
