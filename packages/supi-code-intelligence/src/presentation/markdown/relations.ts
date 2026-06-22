// Relations markdown renderer — consumes use-case data and produces markdown content.

import type { TestSurfaceDetails } from "../../analysis/relations/tests.ts";
import type { ReferenceCollection } from "../../use-case/support/semantic-references.ts";
import { formatReferenceList } from "../../use-case/support/semantic-references.ts";

// ── Callers ──────────────────────────────────────────────────────────

export function renderCallersResult(
  symbolName: string,
  result: ReferenceCollection,
  _cwd: string,
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

  formatReferenceList(lines, result.refs, maxResults);
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
  return lines.join("\n");
}

// ── Imports ─────────────────────────────────────────────────────────

/**
 * Render imports for a file as a graph section.
 *
 * Imports are file-level structural results from tree-sitter — they show
 * every module specifier that the target file imports.
 */
export function renderImportsResult(
  displayName: string,
  imports: Array<{ moduleSpecifier: string; startLine: number }>,
  relPath: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# Imports of \`${displayName}\` (structural)`);
  lines.push("");
  lines.push(`**${imports.length} import${imports.length !== 1 ? "s" : ""}** in \`${relPath}\``);
  lines.push("");

  const shown = imports.slice(0, maxResults);
  for (const entry of shown) {
    lines.push(`- \`${entry.moduleSpecifier}\` (L${entry.startLine})`);
  }
  if (imports.length > maxResults) {
    lines.push(`- _+${imports.length - maxResults} more_`);
  }
  return lines.join("\n");
}

// ── Exports ─────────────────────────────────────────────────────────

/**
 * Render exports for a file as a graph section.
 *
 * Exports are file-level structural results from tree-sitter — they show
 * every named export from the target file.
 */
export function renderExportsResult(
  displayName: string,
  exports: Array<{ name: string; kind: string; startLine: number }>,
  relPath: string,
  maxResults: number,
): string {
  const lines: string[] = [];
  lines.push(`# Exports of \`${displayName}\` (structural)`);
  lines.push("");
  lines.push(`**${exports.length} export${exports.length !== 1 ? "s" : ""}** in \`${relPath}\``);
  lines.push("");

  const shown = exports.slice(0, maxResults);
  for (const entry of shown) {
    const kindLabel = entry.kind ? ` (${entry.kind})` : "";
    lines.push(`- \`${entry.name}\`${kindLabel} (L${entry.startLine})`);
  }
  if (exports.length > maxResults) {
    lines.push(`- _+${exports.length - maxResults} more_`);
  }
  return lines.join("\n");
}

// ── Combined graph ───────────────────────────────────────────────────

/** Relation families accepted by code_graph. */
export type GraphRelationKind =
  | "all"
  | "references"
  | "callees"
  | "imports"
  | "exports"
  | "implements"
  | "tests";

/** A section in the combined graph output. */
export type GraphSection =
  | {
      kind: "ok";
      rel: GraphRelationKind;
      count: number;
      content: string;
      tests?: TestSurfaceDetails;
    }
  | { kind: "unavailable"; rel: GraphRelationKind; message: string; tests?: TestSurfaceDetails }
  | {
      kind: "not-implemented";
      rel: GraphRelationKind;
      message: string;
      tests?: TestSurfaceDetails;
    };

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
    } else if (section.kind === "unavailable") {
      lines.push(`**${section.rel}**: ${section.message}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
