// Callers action — find call sites for a symbol.

import * as path from "node:path";
import type { CodeQueryParams as ActionParams } from "../query-params.ts";
import { resolveTarget } from "../resolve-target.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { SemanticSubstrate } from "../substrates/types.ts";
import type { ResolvedTargetGroup } from "../target-resolution.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";
import {
  aggregatePerTarget,
  collectReferences,
  formatReferenceList,
} from "./semantic-references.ts";

export async function executeCallersAction(
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
    return executeFileLevelCallers(target, params, cwd, semantic);
  }

  const result = await collectReferences(target, cwd, semantic);
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
      candidateCount: result.refs.length,
      omittedCount: result.externalCount,
      nextQueries: [
        "`code_affected` for impact analysis",
        "Use `code_pattern` only when you explicitly want text-search hints",
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
          nextQueries: ["Use `code_affected` before editing a broadly referenced target"],
        },
      },
    };
  }

  const relPath = path.relative(cwd, target.file);
  return {
    content: `No caller data available for ${relPath}:${target.displayLine}:${target.displayCharacter}.`,
    details: {
      type: "search" as const,
      data: {
        confidence: "unavailable",
        scope: params.path ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: ["Enable LSP for semantic caller resolution or use `code_pattern` explicitly"],
      },
    },
  };
}

async function executeFileLevelCallers(
  targetGroup: ResolvedTargetGroup,
  params: ActionParams,
  cwd: string,
  semantic: SemanticSubstrate,
): Promise<CodeIntelResult> {
  const perTarget = await Promise.all(
    targetGroup.targets.map(async (target) => ({
      target,
      result: await collectReferences(target, cwd, semantic),
    })),
  );

  const aggregated = await aggregatePerTarget(targetGroup.targets, (target) =>
    collectReferences(target, cwd, semantic),
  );

  const withRefs = perTarget.filter((entry) => entry.result.refs.length > 0);

  const lines: string[] = [];
  lines.push(`# Callers in \`${targetGroup.displayName}\``);
  lines.push("");
  lines.push(
    `**${targetGroup.targets.length} exported target${targetGroup.targets.length !== 1 ? "s" : ""}** | **${aggregated.refs.length} reference${aggregated.refs.length !== 1 ? "s" : ""}** (${aggregated.confidence})`,
  );
  if (aggregated.externalCount > 0) {
    lines.push(
      `_+${aggregated.externalCount} external reference${aggregated.externalCount !== 1 ? "s" : ""}_`,
    );
  }
  lines.push("");

  for (const entry of withRefs) {
    lines.push(`## \`${entry.target.name ?? "symbol"}\``);
    formatReferenceList(lines, entry.result.refs, params.maxResults ?? 5, cwd);
    lines.push("");
  }

  if (withRefs.length === 0) {
    lines.push("No caller references found for the discovered file-level targets.");
    lines.push("");
  }

  const details: SearchDetails = {
    confidence: aggregated.confidence,
    scope: params.path ?? null,
    candidateCount: aggregated.refs.length,
    omittedCount: aggregated.externalCount,
    nextQueries: [
      "`code_affected` for impact analysis",
      "Use `file` + coordinates to drill into one symbol precisely",
    ],
  };

  return { content: lines.join("\n"), details: { type: "search" as const, data: details } };
}

function formatTargetCallers(
  title: string,
  result: {
    refs: Array<{ file: string; line: number }>;
    confidence: string;
    externalCount: number;
  },
  cwd: string,
  params: ActionParams,
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
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
  formatReferenceList(lines, result.refs, params.maxResults ?? 5, cwd);
  return lines.join("\n");
}
