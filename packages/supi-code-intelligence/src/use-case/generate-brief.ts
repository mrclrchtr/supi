import * as fs from "node:fs";
import * as path from "node:path";
import { generateFocusedBrief, generateProjectBrief } from "../brief.ts";
import type { ArchitectureModel } from "../model.ts";
import { findModuleForPath } from "../model.ts";
import { renderAnchoredBrief, renderSymbolBrief } from "../presentation/markdown/brief.ts";
import { normalizePath } from "../search-helpers.ts";
import type { TargetResolutionResult } from "../target-resolution.ts";
import { resolveSymbolTarget } from "../target-resolution.ts";
import { gatherTreeSitterContext } from "./gather-context.ts";
import type { BriefDeps, BriefInput, BriefUseCaseResult } from "./types.ts";

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
      return executePathBrief(input.path, deps, input);
    case "file":
      return executeFileBrief(input.file, deps, input);
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

async function executePathBrief(
  requestPath: string,
  deps: BriefDeps,
  input: BriefInput,
): Promise<BriefUseCaseResult> {
  if (!deps.model) {
    return noModelResult();
  }
  const resolved = normalizePath(requestPath, deps.cwd);
  const maxResults =
    "maxResults" in input ? (input as { maxResults?: number }).maxResults : undefined;
  const result = await generateFocusedBrief(deps.model, resolved, {
    provider: deps.provider,
    cwd: deps.cwd,
    maxResults,
  });
  return { content: result.content, details: result.details };
}

async function executeFileBrief(
  file: string,
  deps: BriefDeps,
  input: BriefInput,
): Promise<BriefUseCaseResult> {
  if (!deps.model) {
    return noModelResult();
  }
  const resolved = normalizePath(file, deps.cwd);
  const maxResults =
    "maxResults" in input ? (input as { maxResults?: number }).maxResults : undefined;
  const result = await generateFocusedBrief(deps.model, resolved, {
    provider: deps.provider,
    cwd: deps.cwd,
    maxResults,
  });
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
  const context = await gatherTreeSitterContext(deps.provider, relPath, line, character);

  const details = {
    confidence: "structural" as const,
    focusTarget: `${relPath}:${line}:${character}`,
    startHere: [] as Array<{ target: string; reason: string }>,
    publicSurfaces: [] as string[],
    dependencySummary: null as { moduleCount: number; edgeCount: number } | null,
    omittedCount: 0,
    nextQueries: [
      `\`code_graph\`, \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for reference sites`,
      `\`code_impact\` with \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for impact analysis`,
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

  const provider = deps.provider;
  if (!provider) {
    return {
      content: `**Error:** Symbol discovery requires an active code provider. Use \`file\` + coordinates, or enable LSP and retry.`,
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
  const resolved = await resolveSymbolTarget(symbol, deps.cwd, provider, {
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
    deps.provider,
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
      `\`code_graph\`, \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for reference sites`,
      `\`code_impact\` with \`file: "${relPath}"\`, \`line: ${target.displayLine}\`, and \`character: ${target.displayCharacter}\` for impact analysis`,
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
