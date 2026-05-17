// Implementations action — find concrete implementations via LSP or heuristic.

import * as path from "node:path";
import { getSessionLspService } from "@mrclrchtr/supi-lsp/api";
import { resolveTarget } from "../resolve-target.ts";
import {
  escapeRegex,
  isInProjectPath,
  normalizePath,
  runRipgrep,
  uriToFile,
} from "../search-helpers.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { ActionParams } from "../tool-actions.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: implementation lookup has distinct semantic, unsupported-file, and heuristic branches
export async function executeImplementationsAction(
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
    return {
      content: `**Error:** File-level implementation discovery is not available for \`${path.relative(cwd, target.file)}\`.\n\nProvide \`line\` and \`character\`, or a \`symbol\` for discovery.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: params.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Use `file` + coordinates or `symbol` for implementation lookup"],
        },
      },
    };
  }

  const lspState = getSessionLspService(cwd);
  const relPath = path.relative(cwd, target.file);

  if (lspState.kind === "ready") {
    const impls = await lspState.service.implementation(target.file, target.position);
    if (impls) {
      const locations = Array.isArray(impls) ? impls : [impls];
      if (locations.length > 0) {
        const content = formatSemanticImpls(locations, cwd, params.maxResults ?? 8);
        const { project: projectLocs, external: externalLocs } = partitionImpls(locations, cwd);
        const searchDetails: SearchDetails = {
          confidence: "semantic",
          scope: params.path ?? null,
          candidateCount: projectLocs.length,
          omittedCount: externalLocs.length,
          nextQueries: [
            "`code_intel affected` before changing implementations",
            "`code_intel brief` on containing modules for deeper context",
          ],
        };
        return { content, details: { type: "search" as const, data: searchDetails } };
      }
    }
  }

  if (target.name) {
    const result = formatHeuristicImpls(target.name, params, cwd);
    const details: SearchDetails = {
      confidence: "heuristic",
      scope: params.path ?? null,
      candidateCount: result.matchCount,
      omittedCount: 0,
      nextQueries: ["Enable LSP for semantic implementation resolution"],
    };
    return { content: result.content, details: { type: "search" as const, data: details } };
  }

  return {
    content: `No implementations found for ${relPath}:${target.displayLine}:${target.displayCharacter}.\n\nLSP implementation lookup may not be available. Try \`code_intel pattern\` with the type name.`,
    details: {
      type: "search" as const,
      data: {
        confidence: "unavailable",
        scope: params.path ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: [
          "Enable LSP for semantic implementation resolution, or try `code_intel pattern`",
        ],
      },
    },
  };
}

function partitionImpls(
  locations: Array<{
    uri?: string;
    targetUri?: string;
    range?: { start: { line: number } };
    targetRange?: { start: { line: number } };
  }>,
  cwd: string,
): { project: typeof locations; external: typeof locations } {
  const project: typeof locations = [];
  const external: typeof locations = [];
  for (const loc of locations) {
    const uri = loc.uri ?? loc.targetUri ?? "";
    const filePath = uriToFile(uri);
    if (filePath && isInProjectPath(filePath, cwd)) {
      project.push(loc);
    } else {
      external.push(loc);
    }
  }
  return { project, external };
}

function formatSemanticImpls(
  locations: Array<{
    uri?: string;
    targetUri?: string;
    range?: { start: { line: number } };
    targetRange?: { start: { line: number } };
  }>,
  cwd: string,
  maxResults: number,
): string {
  const { project: projectLocs, external: externalLocs } = partitionImpls(locations, cwd);

  const lines: string[] = [];
  lines.push("# Implementations (semantic)");
  lines.push("");
  lines.push(`**${projectLocs.length} implementation${projectLocs.length !== 1 ? "s" : ""}**`);
  if (externalLocs.length > 0) {
    const suffix =
      externalLocs.length === 1
        ? "+1 external implementation"
        : `+${externalLocs.length} external implementations`;
    lines.push(`_${suffix} (node_modules, .pnpm, or out-of-tree)_`);
  }
  lines.push("");

  let shown = 0;
  for (const loc of projectLocs) {
    if (shown >= maxResults) break;
    const uri = loc.uri ?? loc.targetUri ?? "";
    const range = loc.range ?? loc.targetRange ?? null;
    const filePath = uriToFile(uri);
    const implRelPath = path.relative(cwd, filePath);
    const line = range ? range.start.line + 1 : 0;
    lines.push(`- \`${implRelPath}\`:${line}`);
    shown++;
  }

  if (projectLocs.length > maxResults) {
    lines.push(`- _+${projectLocs.length - maxResults} more omitted_`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatHeuristicImpls(
  symbol: string,
  params: ActionParams,
  cwd: string,
): { content: string; matchCount: number } {
  const scopePath = params.path ? normalizePath(params.path, cwd) : cwd;
  const pattern = `(implements|extends)\\s+.*\\b${escapeRegex(symbol)}\\b`;
  const matches = runRipgrep(pattern, scopePath, cwd, { maxMatches: 10 });

  if (matches.length === 0) {
    return {
      content: `No implementations found for \`${symbol}\`.\n\nTry \`code_intel pattern\` with the type name.`,
      matchCount: 0,
    };
  }

  const lines: string[] = [];
  lines.push(`# Implementations of \`${symbol}\` (heuristic)`);
  lines.push("");
  lines.push(
    `**${matches.length} candidate${matches.length > 1 ? "s" : ""}** — text-search hints, not semantic implementations`,
  );
  lines.push("");

  for (const m of matches.slice(0, 8)) {
    lines.push(`- \`${m.file}\`:${m.line} — \`${m.text.slice(0, 80)}\``);
  }
  if (matches.length > 8) {
    lines.push(`- _+${matches.length - 8} more omitted_`);
  }
  lines.push("");
  return { content: lines.join("\n"), matchCount: matches.length };
}
