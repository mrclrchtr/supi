// Brief markdown renderer — consumes use-case data and produces markdown content + details metadata.

import * as path from "node:path";
import type { ArchitectureModel } from "../../model.ts";
import { findModuleForPath } from "../../model.ts";
import type { BriefDetails } from "../../types.ts";

interface TreeSitterContext {
  nodeInfo: unknown;
  outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  imports: Array<{ moduleSpecifier: string }>;
  exports: Array<{ name: string; kind: string }>;
}

// ── Symbol brief ──────────────────────────────────────────────────────

export function renderSymbolBrief(params: {
  relPath: string;
  symbolName: string;
  targetLine: number;
  targetCharacter: number;
  targetKind: string | null;
  context: TreeSitterContext;
  model: ArchitectureModel | null;
  details: BriefDetails;
  cwd: string;
}): { content: string; details: BriefDetails } {
  const lines: string[] = [];
  lines.push(`# Symbol Brief: ${params.symbolName || params.relPath}`);
  lines.push("");
  lines.push(
    `**Resolved to:** \`${params.relPath}:${params.targetLine}:${params.targetCharacter}\`${params.targetKind ? ` (${params.targetKind})` : ""}`,
  );
  lines.push("");

  appendFileOrientationContext(lines, params.context);

  if (params.model) {
    const resolvedFile = path.resolve(params.cwd, params.relPath);
    const mod = findModuleForPath(params.model, resolvedFile);
    if (mod) {
      const shortName = mod.name.replace(/^@[^/]+\//, "");
      lines.push(`_Module: ${shortName} (\`${mod.relativePath}\`)_`);
      lines.push("");
    }
  }

  appendNextQueries(lines, params.relPath, params.targetLine, params.targetCharacter);

  return { content: lines.join("\n"), details: params.details };
}

function getOutlinePrefix(kind: string): string {
  if (kind === "function" || kind === "method") return "ƒ";
  if (kind === "class") return "◆";
  return "·";
}

function appendFileOrientationContext(lines: string[], context: TreeSitterContext): void {
  if (context.outline.length > 0) {
    lines.push("## File Outline");
    const shown = context.outline.slice(0, 15);
    for (const item of shown) {
      const prefix = getOutlinePrefix(item.kind);
      lines.push(`- ${prefix} \`${item.name}\` (${item.kind}) L${item.startLine}`);
    }
    if (context.outline.length > 15) {
      lines.push(`- _+${context.outline.length - 15} more declarations_`);
    }
    lines.push("");
  }

  if (context.imports.length > 0) {
    lines.push("## Imports");
    const shown = context.imports.slice(0, 10);
    for (const imp of shown) {
      lines.push(`- \`${imp.moduleSpecifier}\``);
    }
    if (context.imports.length > 10) {
      lines.push(`- _+${context.imports.length - 10} more_`);
    }
    lines.push("");
  }

  if (context.exports.length > 0) {
    lines.push("## Exports");
    const shown = context.exports.slice(0, 10);
    for (const exp of shown) {
      lines.push(`- \`${exp.name}\` (${exp.kind})`);
    }
    if (context.exports.length > 10) {
      lines.push(`- _+${context.exports.length - 10} more_`);
    }
    lines.push("");
  }
}

// ── File brief ───────────────────────────────────────────────────────

interface FileBriefInput {
  relPath: string;
  lineCount: number;
  isEntrypoint: boolean;
  moduleName: string | null;
  moduleRelativePath: string | null;
  enrichment: {
    outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
    imports: Array<{ moduleSpecifier: string }>;
    exports: Array<{ name: string; kind: string }>;
    diagnostics: Array<{ line: number; severity: number; message: string }>;
  };
  maxResults?: number;
}

export function renderFileBrief(input: FileBriefInput): string {
  const lines: string[] = [];
  lines.push(`# File: ${input.relPath}`);
  lines.push("");

  if (input.moduleName) {
    lines.push(`_Module: ${input.moduleName} (\`${input.moduleRelativePath}\`)_`);
    lines.push("");
  }

  if (input.isEntrypoint) {
    lines.push("**This file is a module entrypoint.**");
    lines.push("");
  }

  lines.push(`- Lines: ${input.lineCount}`);
  lines.push("");

  // Diagnostics section (inline first diagnostic messages)
  appendDiagnosticsSection(lines, input.enrichment.diagnostics, input.maxResults);

  // Structural context (outline, imports, exports)
  if (input.enrichment.outline.length > 0) {
    lines.push("## File Outline");
    const shown = input.enrichment.outline;
    for (const item of shown) {
      const prefix = getOutlinePrefix(item.kind);
      lines.push(`- ${prefix} \`${item.name}\` (${item.kind}) L${item.startLine}`);
    }
    lines.push("");
  }

  if (input.enrichment.imports.length > 0) {
    lines.push("## Imports");
    for (const imp of input.enrichment.imports) {
      lines.push(`- \`${imp.moduleSpecifier}\``);
    }
    lines.push("");
  }

  if (input.enrichment.exports.length > 0) {
    lines.push("## Exports");
    for (const exp of input.enrichment.exports) {
      lines.push(`- \`${exp.name}\` (${exp.kind})`);
    }
    lines.push("");
  }

  lines.push("## Next");
  lines.push(
    `- \`code_graph\`, \`file: "${input.relPath}"\`, and a line/character for reference sites`,
  );
  if (input.moduleRelativePath) {
    lines.push(
      `- \`code_context\` with \`path: "${input.moduleRelativePath}"\` for the containing module overview`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ── Module brief diagnostics section ─────────────────────────────────

export function renderModuleDiagnostics(
  fileDiagnostics: Array<{ file: string; errors: number; warnings: number }>,
  maxResults?: number,
): string | null {
  if (fileDiagnostics.length === 0) return null;

  const lines: string[] = [];
  lines.push("## Diagnostics");
  const cap = maxResults ?? 5;
  for (const entry of fileDiagnostics.slice(0, cap)) {
    const parts: string[] = [];
    if (entry.errors > 0) parts.push(`${entry.errors} error${entry.errors > 1 ? "s" : ""}`);
    if (entry.warnings > 0) parts.push(`${entry.warnings} warning${entry.warnings > 1 ? "s" : ""}`);
    lines.push(`- \`${entry.file}\` — ${parts.join(", ")}`);
  }
  if (fileDiagnostics.length > cap) {
    lines.push(`- _+${fileDiagnostics.length - cap} more files_`);
  }
  lines.push("");

  return lines.join("\n");
}

// ── Diagnostics section (inline) ─────────────────────────────────────

function severityLabel(severity: number): string {
  switch (severity) {
    case 1:
      return "Error";
    case 2:
      return "Warning";
    case 3:
      return "Info";
    case 4:
      return "Hint";
    default:
      return "Diagnostic";
  }
}

function appendDiagnosticsSection(
  lines: string[],
  diagnostics: Array<{ line: number; severity: number; message: string }>,
  _maxResults?: number,
): void {
  if (diagnostics.length === 0) return;

  lines.push("## Diagnostics");
  for (const d of diagnostics) {
    lines.push(`- L${d.line}: ${severityLabel(d.severity)}: ${d.message}`);
  }
  lines.push("");
}

function appendNextQueries(
  lines: string[],
  relPath: string,
  line: number,
  character: number,
): void {
  lines.push("## Next");
  lines.push(
    `- \`code_graph\`, \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for reference sites`,
  );
  lines.push(
    `- \`code_impact\` with \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for impact analysis`,
  );
  lines.push("");
}
