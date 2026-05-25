// Brief orchestration use-case — dispatches by mode, coordinates substrate access,
// and returns fully rendered markdown content + details metadata.

import * as fs from "node:fs";
import * as path from "node:path";
import type { ArchitectureModel } from "@mrclrchtr/supi-code-runtime/api";
import { findModuleForPath } from "@mrclrchtr/supi-code-runtime/api";
import { generateFocusedBrief, generateProjectBrief } from "../brief.ts";
import { renderAnchoredBrief, renderSymbolBrief } from "../presentation/markdown/brief.ts";
import { normalizePath } from "../search-helpers.ts";
import type { SemanticSubstrate, StructuralSubstrate } from "../substrates/types.ts";
import type { TargetResolutionResult } from "../target-resolution.ts";
import { resolveSymbolTarget } from "../target-resolution.ts";
import type { BriefDeps, BriefInput, BriefUseCaseResult } from "./types.ts";

// ── TreeSitterContext is an intermediate data shape from the use-case ──

export interface TreeSitterContext {
  nodeInfo: { type: string; text: string; startLine: number; startCharacter: number } | null;
  outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  imports: Array<{ moduleSpecifier: string }>;
  exports: Array<{ name: string; kind: string }>;
}

// ── Public entrypoint ─────────────────────────────────────────────────

export async function executeBrief(
  input: BriefInput,
  deps: BriefDeps,
): Promise<BriefUseCaseResult> {
  switch (input.kind) {
    case "project":
      if (deps.model) {
        return executeProjectBrief(deps.model);
      }
      return noModelResult();
    case "path":
      return executePathBrief(input.path, deps);
    case "file":
      return executeFileBrief(input.file, deps);
    case "anchored":
      return executeAnchoredBrief(input, deps);
    case "symbol":
      return executeSymbolBrief(input.symbol, input.path, deps);
  }
}

// ── Project brief ─────────────────────────────────────────────────────

function executeProjectBrief(model: ArchitectureModel): BriefUseCaseResult {
  if (!model) {
    return noModelResult();
  }
  const result = generateProjectBrief(model);
  return { content: result.content, details: result.details };
}

// ── Path / file briefs ────────────────────────────────────────────────

function executePathBrief(requestPath: string, deps: BriefDeps): BriefUseCaseResult {
  if (!deps.model) {
    return noModelResult();
  }
  const resolved = normalizePath(requestPath, deps.cwd);
  const result = generateFocusedBrief(deps.model, resolved);
  return { content: result.content, details: result.details };
}

function executeFileBrief(file: string, deps: BriefDeps): BriefUseCaseResult {
  if (!deps.model) {
    return noModelResult();
  }
  const resolved = normalizePath(file, deps.cwd);
  const result = generateFocusedBrief(deps.model, resolved);
  return { content: result.content, details: result.details };
}

// ── Anchored brief ────────────────────────────────────────────────────

async function executeAnchoredBrief(
  input: { file: string; line: number; character: number },
  deps: BriefDeps,
): Promise<BriefUseCaseResult> {
  const { file, line, character } = input;
  const resolvedFile = normalizePath(file, deps.cwd);

  if (!fs.existsSync(resolvedFile)) {
    return {
      content: `**Error:** File not found: \`${file}\``,
      details: {
        confidence: "unavailable",
        focusTarget: `${file}:${line}:${character}`,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
    };
  }

  const relPath = path.relative(deps.cwd, resolvedFile);
  const context = await gatherTreeSitterContext(deps.structural, relPath, line, character);

  const details = {
    confidence: "structural" as const,
    focusTarget: `${relPath}:${line}:${character}`,
    startHere: [] as Array<{ target: string; reason: string }>,
    publicSurfaces: [] as string[],
    dependencySummary: null as { moduleCount: number; edgeCount: number } | null,
    omittedCount: 0,
    nextQueries: [
      `\`code_relations\` with \`kind: "callers"\`, \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for call sites`,
      `\`code_affected\` with \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for impact analysis`,
    ],
  };

  const rendered = renderAnchoredBrief({
    relPath,
    line,
    character,
    context,
    model: deps.model ?? null,
    details,
    cwd: deps.cwd,
  });

  return rendered;
}

// ── Symbol brief ──────────────────────────────────────────────────────

async function executeSymbolBrief(
  symbol: string,
  scopePath: string | undefined,
  deps: BriefDeps,
): Promise<BriefUseCaseResult> {
  if (!deps.model || deps.model.modules.length === 0) {
    return {
      content: `**Error:** Symbol brief requires a project model, which is not available.`,
      details: {
        confidence: "unavailable",
        focusTarget: symbol,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: ["Add a package.json or workspace manifest to enable architecture analysis"],
      },
    };
  }

  const semanticModule = await import("../substrates/lsp-adapter.ts");
  const semantic: SemanticSubstrate = semanticModule.createSemanticSubstrate(deps.cwd);
  const resolved = await resolveSymbolTarget(symbol, deps.cwd, semantic, {
    path: scopePath,
  });

  if (resolved.kind === "error") {
    return {
      content: resolved.message,
      details: {
        confidence: "unavailable",
        focusTarget: symbol,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [
          "Use `file` + coordinates for a precise symbol brief, or enable LSP and retry",
        ],
      },
    };
  }

  if (resolved.kind === "disambiguation") {
    const disambiguationContent = formatDisambiguation(symbol, resolved);
    return {
      content: disambiguationContent,
      details: {
        confidence: "unavailable",
        focusTarget: symbol,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: resolved.omittedCount,
        nextQueries: [
          "Use `file` + coordinates for a precise symbol brief, or enable LSP and retry",
        ],
      },
    };
  }

  const target = resolved.target;
  const relPath = path.relative(deps.cwd, target.file);

  const mod = findModuleForPath(deps.model, target.file);
  const context = await gatherTreeSitterContext(
    deps.structural,
    relPath,
    target.displayLine,
    target.displayCharacter,
  );

  const details = {
    confidence: target.confidence,
    focusTarget: `${target.name ?? relPath}:${target.displayLine}:${target.displayCharacter}`,
    startHere: [] as Array<{ target: string; reason: string }>,
    publicSurfaces: [] as string[],
    dependencySummary: mod ? { moduleCount: 1, edgeCount: mod.internalDeps.length } : null,
    omittedCount: 0,
    nextQueries: [
      `\`code_relations\` with \`kind: "callers"\`, \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for call sites`,
      `\`code_affected\` with \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for impact analysis`,
    ],
  };

  const rendered = renderSymbolBrief({
    relPath,
    symbolName: target.name ?? "",
    targetLine: target.displayLine,
    targetCharacter: target.displayCharacter,
    targetKind: target.kind,
    context,
    model: deps.model ?? null,
    details,
    cwd: deps.cwd,
  });

  return rendered;
}

// ── Helpers ───────────────────────────────────────────────────────────

async function gatherTreeSitterContext(
  structural: StructuralSubstrate,
  relPath: string,
  line: number,
  character: number,
): Promise<TreeSitterContext> {
  let nodeInfo: TreeSitterContext["nodeInfo"] = null;
  let outline: TreeSitterContext["outline"] = [];
  let imports: TreeSitterContext["imports"] = [];
  let exports: TreeSitterContext["exports"] = [];

  try {
    const nodeResult = await structural.nodeAt(relPath, line, character);
    if (nodeResult.kind === "success") {
      nodeInfo = {
        type: nodeResult.data.type,
        text: nodeResult.data.text,
        startLine: nodeResult.data.startLine,
        startCharacter: nodeResult.data.startCharacter,
      };
    }

    const outlineResult = await structural.outline(relPath);
    if (outlineResult.kind === "success") {
      outline = outlineResult.data.map((item) => ({
        name: item.name,
        kind: item.kind,
        startLine: item.startLine,
        endLine: item.endLine,
      }));
    }

    const importsResult = await structural.imports(relPath);
    if (importsResult.kind === "success") {
      imports = importsResult.data;
    }

    const exportsResult = await structural.exports(relPath);
    if (exportsResult.kind === "success") {
      exports = exportsResult.data.map((item) => ({
        name: item.name,
        kind: item.kind,
      }));
    }
  } catch {
    // Tree-sitter not available
  }

  return { nodeInfo, outline, imports, exports };
}

function noModelResult(): BriefUseCaseResult {
  return {
    content:
      "No project structure detected. This directory has no recognizable project metadata or source files.",
    details: {
      confidence: "unavailable",
      focusTarget: null,
      startHere: [],
      publicSurfaces: [],
      dependencySummary: null,
      omittedCount: 0,
      nextQueries: ["Add a package.json or pnpm-workspace.yaml to enable architecture analysis"],
    },
  };
}

function formatDisambiguation(
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
