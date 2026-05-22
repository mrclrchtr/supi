// Brief action — architecture overviews and focused briefs.

import * as fs from "node:fs";
import * as path from "node:path";
import type { TreeSitterService } from "@mrclrchtr/supi-tree-sitter/api";
import { buildArchitectureModel, findModuleForPath } from "../architecture.ts";
import { generateFocusedBrief, generateProjectBrief } from "../brief.ts";
import { withStructuralSession } from "../providers/structural-provider.ts";
import type { CodeQueryParams as ActionParams } from "../query-params.ts";
import { normalizePath } from "../search-helpers.ts";
import {
  type ResolvedTarget,
  resolveSymbolTarget,
  type TargetResolutionResult,
} from "../target-resolution.ts";
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
      details: {
        type: "brief" as const,
        data: {
          confidence: "unavailable",
          focusTarget: null,
          startHere: [],
          publicSurfaces: [],
          dependencySummary: null,
          omittedCount: 0,
          nextQueries: [
            "Add a package.json or pnpm-workspace.yaml to enable architecture analysis",
          ],
        },
      },
    };
  }

  if (params.file && params.line != null && params.character != null) {
    const content = await executeAnchoredBrief(params, cwd, model);
    const relPath = path.relative(cwd, normalizePath(params.file ?? "", cwd));
    const mod = findModuleForPath(model, path.resolve(cwd, relPath));
    return {
      content,
      details: {
        type: "brief" as const,
        data: {
          confidence: "structural",
          focusTarget: `${relPath}:${params.line}:${params.character}`,
          startHere: [],
          publicSurfaces: [],
          dependencySummary: mod && model ? { moduleCount: 1, edgeCount: 0 } : null,
          omittedCount: 0,
          nextQueries: [
            `\`code_relations\` with \`kind: "callers"\`, \`file: "${relPath}"\`, \`line: ${params.line}\`, and \`character: ${params.character}\` for call sites`,
            `\`code_affected\` with \`file: "${relPath}"\`, \`line: ${params.line}\`, and \`character: ${params.character}\` for impact analysis`,
          ],
        },
      },
    };
  }

  if (params.symbol) {
    return executeSymbolBrief(params, cwd, model);
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

async function executeSymbolBrief(
  params: ActionParams,
  cwd: string,
  model: NonNullable<Awaited<ReturnType<typeof buildArchitectureModel>>>,
): Promise<CodeIntelResult> {
  const symbol = params.symbol ?? "";
  const resolved = await resolveSymbolTarget(symbol, cwd, { path: params.path });

  if (resolved.kind === "error") {
    return createUnavailableSymbolBriefResult(symbol, resolved.message);
  }

  if (resolved.kind === "disambiguation") {
    return createUnavailableSymbolBriefResult(
      symbol,
      formatBriefDisambiguation(symbol, resolved),
      resolved.omittedCount,
    );
  }

  return buildResolvedSymbolBriefResult(resolved.target, cwd, model);
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

async function buildResolvedSymbolBriefResult(
  target: ResolvedTarget,
  cwd: string,
  model: NonNullable<Awaited<ReturnType<typeof buildArchitectureModel>>>,
): Promise<CodeIntelResult> {
  const relPath = path.relative(cwd, target.file);
  const content = await executeResolvedSymbolBrief(target, cwd, model);
  const mod = findModuleForPath(model, target.file);

  return {
    content,
    details: {
      type: "brief" as const,
      data: {
        confidence: target.confidence,
        focusTarget: `${target.name ?? relPath}:${target.displayLine}:${target.displayCharacter}`,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: mod ? { moduleCount: 1, edgeCount: 0 } : null,
        omittedCount: 0,
        nextQueries: [
          `\`code_relations\` with \`kind: "callers"\`, \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for call sites`,
          `\`code_affected\` with \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for impact analysis`,
        ],
      },
    },
  };
}

async function executeResolvedSymbolBrief(
  target: ResolvedTarget,
  cwd: string,
  model: NonNullable<Awaited<ReturnType<typeof buildArchitectureModel>>>,
): Promise<string> {
  const relPath = path.relative(cwd, target.file);
  const lines: string[] = [];

  lines.push(`# Symbol Brief: ${target.name ?? relPath}`);
  lines.push("");
  lines.push(
    `**Resolved to:** \`${relPath}:${target.displayLine}:${target.displayCharacter}\`${target.kind ? ` (${target.kind})` : ""}`,
  );
  lines.push("");

  await addTreeSitterContext({
    lines,
    relPath,
    line1: target.displayLine,
    char1: target.displayCharacter,
    cwd,
  });
  addModuleContext(lines, model, target.file);
  addNextQueries(lines, relPath, target.displayLine, target.displayCharacter);

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
  try {
    await withStructuralSession(cwd, async (tsSession) => {
      await addNodeContext(lines, tsSession, relPath, { line: line1, char: char1 });
      await addOutlineContext(lines, tsSession, relPath, line1);
      await addImportsContext(lines, tsSession, relPath);
      await addExportsContext(lines, tsSession, relPath);
    });
  } catch {
    // Tree-sitter not available
  }
}

async function addNodeContext(
  lines: string[],
  ts: TreeSitterService,
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
  ts: TreeSitterService,
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
  ts: TreeSitterService,
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
  ts: TreeSitterService,
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
    `- \`code_relations\` with \`kind: "callers"\`, \`file: "${relPath}"\`, \`line: ${line1}\`, and \`character: ${char1}\` for call sites`,
  );
  lines.push(
    `- \`code_affected\` with \`file: "${relPath}"\`, \`line: ${line1}\`, and \`character: ${char1}\` for impact analysis`,
  );
  lines.push("");
}

function createUnavailableSymbolBriefResult(
  symbol: string,
  content: string,
  omittedCount = 0,
): CodeIntelResult {
  return {
    content,
    details: {
      type: "brief" as const,
      data: {
        confidence: "unavailable",
        focusTarget: symbol,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount,
        nextQueries: [
          "Use `file` + coordinates for a precise symbol brief, or enable LSP and retry",
        ],
      },
    },
  };
}

function formatBriefDisambiguation(
  symbol: string,
  result: Extract<TargetResolutionResult, { kind: "disambiguation" }>,
): string {
  const lines: string[] = [];
  lines.push(`# Disambiguation needed for \`${symbol}\``);
  lines.push("");
  const omitNote = result.omittedCount > 0 ? ` (+${result.omittedCount} more)` : "";
  lines.push(
    `Found ${result.candidates.length} candidates${omitNote}. Rerun with anchored coordinates:`,
  );
  lines.push("");

  for (const candidate of result.candidates) {
    const kind = candidate.kind ? ` (${candidate.kind})` : "";
    const container = candidate.container ? ` in ${candidate.container}` : "";
    lines.push(
      `${candidate.rank}. **${candidate.name}**${kind}${container} — \`${candidate.file}\`:${candidate.line}:${candidate.character}`,
    );
  }

  return lines.join("\n");
}
