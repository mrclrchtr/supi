// Implementations action — find concrete implementations via LSP.

import * as path from "node:path";
import type { CodeQueryParams as ActionParams } from "../query-params.ts";
import { resolveTarget } from "../resolve-target.ts";
import { isInProjectPath, uriToFile } from "../search-helpers.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { SemanticSubstrate } from "../substrates/types.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";

export async function executeImplementationsAction(
  params: ActionParams,
  cwd: string,
  semantic: SemanticSubstrate,
): Promise<CodeIntelResult> {
  const target = await resolveTarget(params, cwd, semantic);
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

  const relPath = path.relative(cwd, target.file);

  const impls = await semantic.implementation(target.file, target.position);
  if (impls) {
    if (impls.length > 0) {
      const content = formatSemanticImpls(impls, cwd, params.maxResults ?? 8);
      const { project: projectLocs, external: externalLocs } = partitionImpls(impls, cwd);
      const searchDetails: SearchDetails = {
        confidence: "semantic",
        scope: params.path ?? null,
        candidateCount: projectLocs.length,
        omittedCount: externalLocs.length,
        nextQueries: [
          "`code_affected` before changing implementations",
          "`code_brief` on containing modules for deeper context",
        ],
      };
      return { content, details: { type: "search" as const, data: searchDetails } };
    }

    const semanticEmptyDetails: SearchDetails = {
      confidence: "semantic",
      scope: params.path ?? null,
      candidateCount: 0,
      omittedCount: 0,
      nextQueries: [
        "`code_pattern` only if you explicitly want text-search hints for likely implementations",
      ],
    };
    return {
      content: target.name
        ? `No implementations found for \`${target.name}\`.`
        : `No implementations found for ${relPath}:${target.displayLine}:${target.displayCharacter}.`,
      details: { type: "search" as const, data: semanticEmptyDetails },
    };
  }

  return {
    content: target.name
      ? `No implementations found for \`${target.name}\`.`
      : `No implementations found for ${relPath}:${target.displayLine}:${target.displayCharacter}.`,
    details: {
      type: "search" as const,
      data: {
        confidence: "unavailable",
        scope: params.path ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: ["Enable LSP for semantic implementation resolution."],
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
