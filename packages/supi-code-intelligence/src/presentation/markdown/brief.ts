// Brief markdown renderer — consumes use-case data and produces markdown content + details metadata.

import * as path from "node:path";
import type { ArchitectureModel } from "../../model.ts";
import { findModuleForPath } from "../../model.ts";
import type { BriefDetails } from "../../types.ts";

// ── Anchored brief ───────────────────────────────────────────────────

interface TreeSitterContext {
  nodeInfo: { type: string; text: string; startLine: number; startCharacter: number } | null;
  outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  imports: Array<{ moduleSpecifier: string }>;
  exports: Array<{ name: string; kind: string }>;
}

export function renderAnchoredBrief(params: {
  relPath: string;
  line: number;
  character: number;
  context: TreeSitterContext;
  model: ArchitectureModel | null;
  details: BriefDetails;
  cwd: string;
}): { content: string; details: BriefDetails } {
  const lines: string[] = [];
  lines.push(`# Anchored Brief: ${params.relPath}:${params.line}:${params.character}`);
  lines.push("");

  appendTreeSitterContext(lines, params.context, params.relPath, params.line, params.cwd);

  if (params.model) {
    const resolvedFile = path.resolve(params.cwd, params.relPath);
    const mod = findModuleForPath(params.model, resolvedFile);
    if (mod) {
      const shortName = mod.name.replace(/^@[^/]+\//, "");
      lines.push(`_Module: ${shortName} (\`${mod.relativePath}\`)_`);
      lines.push("");
    }
  }

  appendNextQueries(lines, params.relPath, params.line, params.character);

  return { content: lines.join("\n"), details: params.details };
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

  appendTreeSitterContext(lines, params.context, params.relPath, params.targetLine, params.cwd);

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

// ── Tree-sitter context rendering ─────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tree-sitter context rendering with node/outline/imports/exports sections kept together for readability
// biome-ignore lint/complexity/useMaxParams: options-object refactor would reduce clarity for this rendering helper
function appendTreeSitterContext(
  lines: string[],
  context: TreeSitterContext,
  relPath: string,
  line: number,
  _cwd: string,
): void {
  if (context.nodeInfo) {
    const node = context.nodeInfo;
    lines.push(`**Node:** \`${node.type}\` at ${relPath}:${node.startLine}:${node.startCharacter}`);
    if (node.text && node.text.length <= 200) {
      lines.push("```");
      lines.push(node.text);
      lines.push("```");
    }
    lines.push("");
  }

  if (context.outline.length > 0) {
    const enclosing = context.outline.find(
      (item) => item.startLine <= line && item.endLine >= line,
    );
    if (enclosing) {
      lines.push(`**Enclosing symbol:** \`${enclosing.name}\` (${enclosing.kind})`);
      lines.push(`- Range: ${relPath}:${enclosing.startLine}–${enclosing.endLine}`);
      lines.push("");
    }

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

function getOutlinePrefix(kind: string): string {
  if (kind === "function" || kind === "method") return "ƒ";
  if (kind === "class") return "◆";
  return "·";
}

function appendNextQueries(
  lines: string[],
  relPath: string,
  line: number,
  character: number,
): void {
  lines.push("## Next");
  lines.push(
    `- \`code_references\`, \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for reference sites`,
  );
  lines.push(
    `- \`code_affected\` with \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for impact analysis`,
  );
  lines.push("");
}
