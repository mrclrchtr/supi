// Relations orchestration use-case — dispatches by kind (callers/callees/implementations),
// coordinates target resolution and provider access, and returns fully rendered results.
import * as path from "node:path";
import {
  renderCalleesResult,
  renderCallersResult,
  renderImplementationsResult,
} from "../presentation/markdown/relations.ts";
import type { CodeProvider } from "../provider/code-provider.ts";
import { resolveTarget } from "../resolve-target.ts";
import { isInProjectPath, uriToFile } from "../search-helpers.ts";
import { isResolvedTargetGroup } from "../semantic-action-helpers.ts";
import type { ResolvedTarget, ResolvedTargetGroup } from "../target-resolution.ts";
import type { CodeIntelResult, SearchDetails } from "../types.ts";
import { aggregatePerTarget, collectReferences } from "./support/semantic-references.ts";
export interface RelationsInput {
  kind: "callers" | "callees" | "implementations";
  path?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
}
type RelationsResolutionParams = Omit<RelationsInput, "kind">;
export interface RelationsDeps {
  cwd: string;
  provider: CodeProvider | null;
}
export async function executeRelations(
  input: RelationsInput,
  deps: RelationsDeps,
): Promise<CodeIntelResult> {
  const { kind: _kind, ...resolutionParams } = input;
  switch (input.kind) {
    case "callers":
      return executeCallers(resolutionParams, deps);
    case "callees":
      return executeCallees(resolutionParams, deps);
    case "implementations":
      return executeImplementations(resolutionParams, deps);
  }
}
async function executeCallers(
  input: RelationsResolutionParams,
  deps: RelationsDeps,
): Promise<CodeIntelResult> {
  const semantic = deps.provider;
  if (!semantic) {
    return {
      content:
        "**Error:** Caller discovery requires an active code provider (LSP). Enable LSP and retry.",
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
  const target = await resolveTarget(input, deps.cwd, semantic);
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
    return executeFileLevelCallers(target, input, deps.cwd, semantic);
  }
  return executeSingleCallers(target, input, deps.cwd, semantic);
}
async function executeSingleCallers(
  target: ResolvedTarget,
  input: RelationsResolutionParams,
  cwd: string,
  semantic: CodeProvider,
): Promise<CodeIntelResult> {
  const result = await collectReferences(target, cwd, semantic);
  if (result.refs.length > 0) {
    const symbolName = target.name ?? "symbol";
    const content = renderCallersResult(symbolName, result, cwd, input.maxResults ?? 5);
    const details: SearchDetails = {
      confidence: result.confidence,
      scope: input.path ?? null,
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
          scope: input.path ?? null,
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
        scope: input.path ?? null,
        candidateCount: 0,
        omittedCount: 0,
        nextQueries: ["Enable LSP for semantic caller resolution or use `code_pattern` explicitly"],
      },
    },
  };
}
async function executeFileLevelCallers(
  targetGroup: ResolvedTargetGroup,
  input: RelationsResolutionParams,
  cwd: string,
  semantic: CodeProvider,
): Promise<CodeIntelResult> {
  const aggregated = await aggregatePerTarget(targetGroup.targets, (target) =>
    collectReferences(target, cwd, semantic),
  );
  const perTarget = await Promise.all(
    targetGroup.targets.map(async (target) => ({
      target,
      result: await collectReferences(target, cwd, semantic),
    })),
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
    const { formatReferenceList } = await import("./support/semantic-references.ts");
    formatReferenceList(lines, entry.result.refs, input.maxResults ?? 5, cwd);
    lines.push("");
  }
  if (withRefs.length === 0) {
    lines.push("No caller references found for the discovered file-level targets.");
    lines.push("");
  }
  const details: SearchDetails = {
    confidence: aggregated.confidence,
    scope: input.path ?? null,
    candidateCount: aggregated.refs.length,
    omittedCount: aggregated.externalCount,
    nextQueries: [
      "`code_affected` for impact analysis",
      "Use `file` + coordinates to drill into one symbol precisely",
    ],
  };
  return {
    content: lines.join("\n"),
    details: { type: "search" as const, data: details },
  };
}
async function executeImplementations(
  input: RelationsResolutionParams,
  deps: RelationsDeps,
): Promise<CodeIntelResult> {
  const semantic = deps.provider;
  if (!semantic) {
    return {
      content:
        "**Error:** Implementation discovery requires an active code provider (LSP). Enable LSP and retry.",
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
  const target = await resolveTarget(input, deps.cwd, semantic);
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
      content: `**Error:** File-level implementation discovery is not available for \`${path.relative(deps.cwd, target.file)}\`.\n\nProvide \`line\` and \`character\`, or a \`symbol\` for discovery.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: input.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Use `file` + coordinates or `symbol` for implementation lookup"],
        },
      },
    };
  }
  const relPath = path.relative(deps.cwd, target.file);
  const impls = await semantic.implementation(target.file, target.position);
  if (impls) {
    if (impls.length > 0) {
      const content = renderImplementationsResult(impls, deps.cwd, input.maxResults ?? 8);
      const { project: projectLocs, external: externalLocs } = partitionImpls(impls, deps.cwd);
      const searchDetails: SearchDetails = {
        confidence: "semantic",
        scope: input.path ?? null,
        candidateCount: projectLocs.length,
        omittedCount: externalLocs.length,
        nextQueries: [
          "`code_affected` before changing implementations",
          "`code_brief` on containing modules for deeper context",
        ],
      };
      return {
        content,
        details: { type: "search" as const, data: searchDetails },
      };
    }
    return {
      content: target.name
        ? `No implementations found for \`${target.name}\`.`
        : `No implementations found for ${relPath}:${target.displayLine}:${target.displayCharacter}.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "semantic",
          scope: input.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: [
            "`code_pattern` only if you explicitly want text-search hints for likely implementations",
          ],
        },
      },
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
        scope: input.path ?? null,
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
async function executeCallees(
  input: RelationsResolutionParams,
  deps: RelationsDeps,
): Promise<CodeIntelResult> {
  const provider = deps.provider;
  if (!provider) {
    return {
      content:
        "**Error:** Callee discovery requires an active code provider. Enable LSP and tree-sitter and retry.",
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
  const target = await resolveTarget(input, deps.cwd, provider);
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
      content: `**Error:** File-level callee discovery is not available for \`${path.relative(deps.cwd, target.file)}\`.\n\nProvide \`line\` and \`character\`, or a \`symbol\` for discovery.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: input.path ?? null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: ["Use `file` + coordinates or `symbol` for callee lookup"],
        },
      },
    };
  }
  const relPath = path.relative(deps.cwd, target.file);
  try {
    const result = await provider.calleesAt(relPath, target.displayLine, target.displayCharacter);
    if (result.kind !== "success") {
      return {
        content: `No callee data available for ${relPath}:${target.displayLine}:${target.displayCharacter}.\n\nUse \`tree_sitter_callees\` with \`file\`, \`line\`, and \`character\` for structural drill-down.`,
        details: {
          type: "search" as const,
          data: {
            confidence: "unavailable",
            scope: null,
            candidateCount: 0,
            omittedCount: 0,
            nextQueries: [
              "Use `lsp_hover` with `file`, `line`, and `character` for type-aware analysis on this file",
            ],
          },
        },
      };
    }
    if (result.data.callees.length === 0) {
      return {
        content: `No callee data available for ${relPath}:${target.displayLine}:${target.displayCharacter}.\n\nUse \`tree_sitter_callees\` with \`file\`, \`line\`, and \`character\` for structural drill-down.`,
        details: {
          type: "search" as const,
          data: {
            confidence: "structural",
            scope: null,
            candidateCount: 0,
            omittedCount: 0,
            nextQueries: [
              "Use `lsp_hover` with `file`, `line`, and `character` for type-aware analysis on this file",
            ],
          },
        },
      };
    }
    const content = renderCalleesResult(result.data, relPath, input.maxResults ?? 8);
    const details: SearchDetails = {
      confidence: "structural",
      scope: null,
      candidateCount: result.data.callees.length,
      omittedCount: Math.max(0, result.data.callees.length - (input.maxResults ?? 8)),
      nextQueries: [
        "Use `lsp_hover` with `file`, `line`, and `character` for precise type information on callees",
      ],
    };
    return { content, details: { type: "search" as const, data: details } };
  } catch {
    return {
      content: `No callee data available for ${relPath}:${target.displayLine}:${target.displayCharacter}.\n\nUse \`tree_sitter_callees\` with \`file\`, \`line\`, and \`character\` for structural drill-down.`,
      details: {
        type: "search" as const,
        data: {
          confidence: "unavailable",
          scope: null,
          candidateCount: 0,
          omittedCount: 0,
          nextQueries: [
            "Use `lsp_hover` with `file`, `line`, and `character` for type-aware analysis on this file",
          ],
        },
      },
    };
  }
}
