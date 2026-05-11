// Brief action — architecture overviews and focused briefs.

import * as fs from "node:fs";
import * as path from "node:path";
import { createTreeSitterSession } from "@mrclrchtr/supi-tree-sitter";
import { buildArchitectureModel, findModuleForPath } from "../architecture.ts";
import { generateFocusedBrief, generateProjectBrief } from "../brief.ts";
import { normalizePath } from "../search-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";
import type { CodeIntelResult } from "../types.ts";

export async function executeBriefAction(
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const model = await buildArchitectureModel(cwd);
  if (!model) {
    return {
      content:
        "No project structure detected. This directory has no recognizable project metadata or source files.",
      details: undefined,
    };
  }

  if (params.file && params.line != null && params.character != null) {
    const content = await executeAnchoredBrief(params, cwd, model);
    return { content, details: undefined };
  }

  if (params.path) {
    const result = generateFocusedBrief(model, normalizePath(params.path, cwd));
    return { content: result.content, details: { type: "brief" as const, data: result.details } };
  }

  if (params.file) {
    const result = generateFocusedBrief(model, normalizePath(params.file, cwd));
    return { content: result.content, details: { type: "brief" as const, data: result.details } };
  }

  const result = generateProjectBrief(model);
  return { content: result.content, details: { type: "brief" as const, data: result.details } };
}

async function executeAnchoredBrief(
  params: ActionParams,
  cwd: string,
  model: NonNullable<Awaited<ReturnType<typeof buildArchitectureModel>>>,
): Promise<string> {
  const file = normalizePath(params.file ?? "", cwd);
  const line1 = params.line ?? 1;
  const char1 = params.character ?? 1;
  const relPath = path.relative(cwd, file);

  if (!fs.existsSync(file)) {
    return `**Error:** File not found: \`${params.file}\``;
  }

  const lines: string[] = [];
  lines.push(`# Anchored Brief: ${relPath}:${line1}:${char1}`);
  lines.push("");

  await addTreeSitterContext({ lines, relPath, line1, char1, cwd });
  addModuleContext(lines, model, file);
  addNextQueries(lines, relPath, line1, char1);

  return lines.join("\n");
}

interface TreeSitterContextInput {
  lines: string[];
  relPath: string;
  line1: number;
  char1: number;
  cwd: string;
}

async function addTreeSitterContext(input: TreeSitterContextInput): Promise<void> {
  const { lines, relPath, line1, char1, cwd } = input;
  let tsSession: ReturnType<typeof createTreeSitterSession> | null = null;
  try {
    tsSession = createTreeSitterSession(cwd);
    await addNodeContext(lines, tsSession, relPath, { line: line1, char: char1 });
    await addOutlineContext(lines, tsSession, relPath, line1);
    await addImportsContext(lines, tsSession, relPath);
    await addExportsContext(lines, tsSession, relPath);
  } catch {
    // Tree-sitter not available
  } finally {
    tsSession?.dispose();
  }
}

async function addNodeContext(
  lines: string[],
  ts: ReturnType<typeof createTreeSitterSession>,
  relPath: string,
  pos: { line: number; char: number },
): Promise<void> {
  const result = await ts.nodeAt(relPath, pos.line, pos.char);
  if (result.kind !== "success") return;
  const node = result.data;
  lines.push(
    `**Node:** \`${node.type}\` at ${relPath}:${node.range.startLine}:${node.range.startCharacter}`,
  );
  if (node.text && node.text.length <= 200) {
    lines.push("```");
    lines.push(node.text);
    lines.push("```");
  }
  lines.push("");
}

async function addOutlineContext(
  lines: string[],
  ts: ReturnType<typeof createTreeSitterSession>,
  relPath: string,
  line1: number,
): Promise<void> {
  const result = await ts.outline(relPath);
  if (result.kind !== "success") return;
  const outline = result.data;

  const enclosing = outline.find(
    (item) => item.range.startLine <= line1 && item.range.endLine >= line1,
  );
  if (enclosing) {
    lines.push(`**Enclosing symbol:** \`${enclosing.name}\` (${enclosing.kind})`);
    lines.push(`- Range: ${relPath}:${enclosing.range.startLine}–${enclosing.range.endLine}`);
    lines.push("");
  }

  if (outline.length > 0) {
    lines.push("## File Outline");
    const shown = outline.slice(0, 15);
    for (const item of shown) {
      const prefix = getOutlinePrefix(item.kind);
      lines.push(`- ${prefix} \`${item.name}\` (${item.kind}) L${item.range.startLine}`);
    }
    if (outline.length > 15) {
      lines.push(`- _+${outline.length - 15} more declarations_`);
    }
    lines.push("");
  }
}

function getOutlinePrefix(kind: string): string {
  if (kind === "function" || kind === "method") return "ƒ";
  if (kind === "class") return "◆";
  return "·";
}

async function addImportsContext(
  lines: string[],
  ts: ReturnType<typeof createTreeSitterSession>,
  relPath: string,
): Promise<void> {
  const result = await ts.imports(relPath);
  if (result.kind !== "success" || result.data.length === 0) return;
  lines.push("## Imports");
  const shown = result.data.slice(0, 10);
  for (const imp of shown) {
    lines.push(`- \`${imp.moduleSpecifier}\``);
  }
  if (result.data.length > 10) {
    lines.push(`- _+${result.data.length - 10} more_`);
  }
  lines.push("");
}

async function addExportsContext(
  lines: string[],
  ts: ReturnType<typeof createTreeSitterSession>,
  relPath: string,
): Promise<void> {
  const result = await ts.exports(relPath);
  if (result.kind !== "success" || result.data.length === 0) return;
  lines.push("## Exports");
  const shown = result.data.slice(0, 10);
  for (const exp of shown) {
    lines.push(`- \`${exp.name}\` (${exp.kind})`);
  }
  if (result.data.length > 10) {
    lines.push(`- _+${result.data.length - 10} more_`);
  }
  lines.push("");
}

function addModuleContext(
  lines: string[],
  model: NonNullable<Awaited<ReturnType<typeof buildArchitectureModel>>>,
  file: string,
): void {
  const mod = findModuleForPath(model, file);
  if (mod) {
    const shortName = mod.name.replace(/^@[^/]+\//, "");
    lines.push(`_Module: ${shortName} (\`${mod.relativePath}\`)_`);
    lines.push("");
  }
}

function addNextQueries(lines: string[], relPath: string, line1: number, char1: number): void {
  lines.push("## Next");
  lines.push(
    `- \`code_intel callers\` with \`file: "${relPath}", line: ${line1}, character: ${char1}\` for call sites`,
  );
  lines.push(
    `- \`code_intel affected\` with \`file: "${relPath}", line: ${line1}, character: ${char1}\` for impact analysis`,
  );
  lines.push("");
}
