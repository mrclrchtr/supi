/**
 * Tool executor for code_resolve.
 *
 * Calls the resolve service and renders compact markdown with stable
 * target handles.
 */

import { relative } from "node:path";
import { executeResolveService } from "../analysis/resolve/service.ts";
import { renderResolveResult } from "../presentation/markdown/resolve.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx, ResolveDetails } from "../types.ts";
import { resolveCrossFieldRules } from "./cross-field.ts";
import { unavailableResolveDetails } from "./details-helpers.ts";
import {
  expandTargetId,
  gateSemanticReadiness,
  resolveScopeParam,
  runPipe,
  validateParams,
} from "./pipeline.ts";
import { renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

export interface CodeResolveToolParams {
  query?: string;
  scope?: string;
  kind?: string;
  file?: string;
  line?: number;
  character?: number;
  maxResults?: number;
  targetId?: string;
}

export async function executeResolveTool(
  params: CodeResolveToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const needsSemantic = Boolean(params.query) && params.kind !== "file" && params.kind !== "File";

  return runPipe(
    params,
    ctx,
    [
      expandTargetId((msg) => ({
        content: msg,
        details: unavailableResolveDetails([
          "Fix the input parameters and retry",
          "Use anchored `file` + `line` + `character` or a `query` for resolution",
        ]),
      })),
      resolveScopeParam((reason) => ({
        content: `**Error:** ${reason}`,
        details: unavailableResolveDetails([
          "Verify the `scope` path exists and is within the workspace",
          "Use an existing workspace-relative file or directory path",
        ]),
      })),
      validateParams(resolveCrossFieldRules, (msg) => ({
        content: msg,
        details: unavailableResolveDetails([
          "Fix the input parameters and retry",
          "Use anchored `file` + `line` + `character` or a `query` for resolution",
        ]),
      })),
      ...(needsSemantic
        ? [
            gateSemanticReadiness("code_resolve", {
              onTimeout: () => ({
                content: renderSemanticReadinessTimeout("code_resolve", 15_000),
                details: unavailableResolveDetails(["Retry shortly or check `code_health`"]),
              }),
              throwOnUnavailable: true,
            }),
          ]
        : []),
    ],
    async (p, c) => {
      const result = await executeResolveService({ ...p, scope: p.scope }, c.session);

      let content = renderResolveResult(result, c.cwd);

      // For single-target resolutions, append actionable "Chain next" guidance.
      if (result.kind === "resolved" && result.targets.length === 1) {
        const target = result.targets[0];
        const rels = suggestedRelations(target.kind);
        if (rels) {
          const chainLine = `Chain next: \`code_graph(targetId: "${target.targetId}", relations: ${JSON.stringify(rels)})\``;
          content = `${content}\n${chainLine}\n`;
        }
      }

      // Build structured details
      if (result.kind === "resolved") {
        const details: ResolveDetails = {
          confidence: result.confidence,
          targetCount: result.targets.length + result.omittedCount,
          omittedCount: result.omittedCount,
          evidenceLists: [
            {
              key: "resolve.targets",
              totalCount: result.targets.length + result.omittedCount,
              shownCount: result.targets.length,
              omittedCount: result.omittedCount,
              partialReason: null,
            },
          ],
          targets: result.targets.map((t) => ({
            targetId: t.targetId,
            spanId: t.spanId,
            file: relative(c.cwd, t.file) || t.file,
            displayLine: t.displayLine,
            displayCharacter: t.displayCharacter,
            name: t.name,
            kind: t.kind,
            anchorKind: t.anchorKind,
            confidence: t.confidence,
            provenance: t.provenance,
            resolution: t.resolution,
          })),
          nextQueries: result.nextQueries,
        };
        return { content, details: { type: "resolve", data: details } };
      }

      if (result.kind === "disambiguation") {
        const details: ResolveDetails = {
          confidence: "semantic",
          targetCount: result.candidates.length + result.omittedCount,
          omittedCount: result.omittedCount,
          evidenceLists: [
            {
              key: "resolve.candidates",
              totalCount: result.candidates.length + result.omittedCount,
              shownCount: result.candidates.length,
              omittedCount: result.omittedCount,
              partialReason: null,
            },
          ],
          targets: [],
          candidates: result.candidates.map((cand) => ({
            targetId: cand.targetId,
            name: cand.name,
            kind: cand.kind,
            container: cand.container,
            file: cand.file,
            line: cand.line,
            character: cand.character,
            reason: cand.reason,
            rank: cand.rank,
            anchorKind: cand.anchorKind,
          })),
          nextQueries: result.nextQueries,
        };
        return { content, details: { type: "resolve", data: details } };
      }

      // Error — still return structured details
      return {
        content,
        details: unavailableResolveDetails([
          "Refine the `query` or `scope`",
          "Use anchored `file` + `line` + `character` for a precise target",
        ]),
      };
    },
  );
}

/**
 * Suggested `code_graph` relations for a resolved symbol kind.
 * Uses only currently-supported relation names.
 */
function suggestedRelations(kind: string | undefined | null): string[] | undefined {
  switch (kind?.toLowerCase()) {
    case "function":
    case "method":
    case "constructor":
      return ["references", "callees", "tests"];
    case "class":
    case "interface":
    case "type":
    case "enum":
      return ["references", "implements"];
    case "file":
    case "module":
      return ["imports", "exports"];
    case "test":
      return ["tests"];
    default:
      return undefined;
  }
}
