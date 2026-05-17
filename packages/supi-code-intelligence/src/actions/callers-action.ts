// Callers action — find call sites for a symbol.

import * as path from "node:path";
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import { resolveTarget } from "../resolve-target.ts";
import {
  escapeRegex,
  filterOutDeclaration,
  isInProjectPath,
  normalizePath,
  runRipgrep,
  uriToFile,
} from "../search-helpers.ts";
import {
  dedupeFileLineRefs,
  highestConfidence,
  isResolvedTargetGroup,
} from "../semantic-action-helpers.ts";
import type { ResolvedTarget, ResolvedTargetGroup } from "../target-resolution.ts";
import type { ActionParams } from "../tool-actions.ts";
import type { CodeIntelResult, ConfidenceMode, SearchDetails } from "../types.ts";

export async function executeCallersAction(
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const target = await resolveTarget(params, cwd);
  if (typeof target === "string") {
    return {
      content: target,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Provide `file`, `line`, `character` or a `symbol` to resolve the target"],
        },
      },
    };
  }

  if (isResolvedTargetGroup(target)) {
    return executeFileLevelCallers(target, params, cwd);
  }

  const result = await collectCallerRefs(target, params, cwd);
  if (result.refs.length > 0) {
    const content = formatTargetCallers(
      `Callers of \`${target.name ?? "symbol"}\``,
      result,
      cwd,
      params,
    );
    const details: SearchDetails = {
      confidence: result.confidence,
      scope: params.path ?? null,
      candidateCount: result.candidateCount,
      omittedCount: result.externalCount,
      nextQueries: [
        "`code_intel affected` for impact analysis",
        "`code_intel pattern` with broader scope for additional matches",
      ],
    };
    return { content, details: { type: "search" as const, data: details } };
  }

  if (target.name) {
    return {
      content: `No references found for \`${target.name}\` (${result.confidence}).`,
      details: {
        type: "search" as const,
        data: {
          confidence: result.confidence,
          scope: params.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Enable LSP for `semantic` caller accuracy"],
        },
      },
    };
  }

  const relPath = path.relative(cwd, target.file);
  return {
    content: `No caller data available for ${relPath}:${target.displayLine}:${target.displayCharacter}. LSP may not be active.\n\nTry \`code_intel pattern\` with the symbol name for text-search matches.`,
    details: {
      type: "search" as const,
      data: {
        confidence: "unavailable",
        scope: params.path ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: ["Enable LSP for semantic caller resolution, or try `code_intel pattern`"],
      },
    },
  };
}

interface CallerRef {
  file: string;
  line: number;
}

interface CallerCollection {
  refs: CallerRef[];
  confidence: ConfidenceMode;
  externalCount: number;
  candidateCount: number;
}

async function executeFileLevelCallers(
  targetGroup: ResolvedTargetGroup,
  params: ActionParams,
  cwd: string,
): Promise<CodeIntelResult> {
  const perTarget = await Promise.all(
    targetGroup.targets.map(async (target) => ({
      target,
      result: await collectCallerRefs(target, params, cwd),
    })),
  );

  const withRefs = perTarget.filter((entry) => entry.result.refs.length > 0);
  const uniqueRefs = dedupeFileLineRefs(withRefs.flatMap((entry) => entry.result.refs));
  const confidence = highestConfidence(withRefs.map((entry) => entry.result.confidence));
  const externalCount = withRefs.reduce((sum, entry) => sum + entry.result.externalCount, 0);

  const lines: string[] = [];
  lines.push(`# Callers in \`${targetGroup.displayName}\``);
  lines.push("");
  lines.push(
    `**${targetGroup.targets.length} exported target${targetGroup.targets.length !== 1 ? "s" : ""}** | **${uniqueRefs.length} reference${uniqueRefs.length !== 1 ? "s" : ""}** (${confidence})`,
  );
  if (externalCount > 0) {
    lines.push(`_+${externalCount} external reference${externalCount !== 1 ? "s" : ""}_`);
  }
  lines.push("");

  for (const entry of withRefs) {
    lines.push(`## \`${entry.target.name ?? "symbol"}\``);
    addRefList(lines, entry.result.refs, cwd, params.maxResults ?? 5);
    lines.push("");
  }

  if (withRefs.length === 0) {
    lines.push("No caller references found for the discovered file-level targets.");
    lines.push("");
  }

  const details: SearchDetails = {
    confidence,
    scope: params.path ?? null,
    candidateCount: uniqueRefs.length,
    omittedCount: externalCount,
    nextQueries: [
      "`code_intel affected` for impact analysis",
      "Use `file` + coordinates to drill into one symbol precisely",
    ],
  };

  return { content: lines.join("\n"), details: { type: "search" as const, data: details } };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: LSP-first caller collection with fallback and declaration filtering is clearest in one helper
async function collectCallerRefs(
  target: ResolvedTarget,
  params: ActionParams,
  cwd: string,
): Promise<CallerCollection> {
  const lspState = getSessionLspService(cwd);

  if (lspState.kind === "ready") {
    const refs = await lspState.service.references(target.file, target.position);
    if (refs && refs.length > 0) {
      const filtered = filterOutDeclaration(refs, target.file, target.position);
      const projectRefs: CallerRef[] = [];
      let externalCount = 0;
      for (const ref of refs) {
        const filePath = uriToFile(ref.uri);
        if (!isInProjectPath(filePath, cwd)) {
          externalCount++;
        }
      }
      for (const ref of filtered) {
        const filePath = uriToFile(ref.uri);
        if (isInProjectPath(filePath, cwd)) {
          projectRefs.push({ file: path.relative(cwd, filePath), line: ref.range.start.line + 1 });
        }
      }
      if (projectRefs.length > 0) {
        return {
          refs: projectRefs,
          confidence: "semantic",
          externalCount,
          candidateCount: projectRefs.length,
        };
      }
    }
  }

  if (!target.name) {
    return { refs: [], confidence: "unavailable", externalCount: 0, candidateCount: 0 };
  }

  const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
  const pattern = `\\b${escapeRegex(target.name)}\\b`;
  const matches = runRipgrep(pattern, scopePath, cwd, { maxMatches: (params.maxResults ?? 8) * 3 });
  const refs = matches
    .filter((match) => !isDeclarationMatch(match.file, match.line, target, cwd))
    .map((match) => ({
      file: path.relative(cwd, path.resolve(cwd, match.file)),
      line: match.line,
    }));

  return { refs, confidence: "heuristic", externalCount: 0, candidateCount: refs.length };
}

function formatTargetCallers(
  title: string,
  result: CallerCollection,
  cwd: string,
  params: ActionParams,
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `**${result.candidateCount} reference${result.candidateCount !== 1 ? "s" : ""}** (${result.confidence})`,
  );
  if (result.externalCount > 0) {
    lines.push(
      `_+${result.externalCount} external reference${result.externalCount !== 1 ? "s" : ""}_`,
    );
  }
  lines.push("");
  addRefList(lines, result.refs, cwd, params.maxResults ?? 5);
  return lines.join("\n");
}

function addRefList(lines: string[], refs: CallerRef[], cwd: string, maxResults: number): void {
  const byFile = groupRefsByFile(refs, cwd);
  let shown = 0;
  for (const [file, locations] of byFile) {
    if (shown >= maxResults) break;
    lines.push(`### ${file}`);
    for (const loc of locations.slice(0, 5)) {
      lines.push(`- L${loc}`);
    }
    if (locations.length > 5) {
      lines.push(`- _+${locations.length - 5} more in this file_`);
    }
    lines.push("");
    shown++;
  }

  if (byFile.size > maxResults) {
    lines.push(
      `_+${byFile.size - maxResults} more files omitted. Narrow with \`path\` or increase \`maxResults\`._`,
    );
  }
}

function groupRefsByFile(refs: CallerRef[], _cwd: string): Map<string, number[]> {
  const byFile = new Map<string, number[]>();
  for (const ref of refs) {
    const group = byFile.get(ref.file) ?? [];
    group.push(ref.line);
    byFile.set(ref.file, group);
  }
  return byFile;
}

function isDeclarationMatch(
  file: string,
  line: number,
  target: ResolvedTarget,
  cwd: string,
): boolean {
  return path.resolve(cwd, file) === target.file && line === target.displayLine;
}
