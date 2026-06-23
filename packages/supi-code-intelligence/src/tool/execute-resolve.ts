/**
 * Tool executor for code_resolve.
 *
 * Calls the resolve service and renders compact markdown with stable
 * target handles.
 */

import { executeResolveService, validateResolveParams } from "../analysis/resolve/service.ts";
import { renderResolveResult } from "../presentation/markdown/resolve.ts";
import { resolveScope } from "../search-helpers.ts";
import type { CodeIntelResult, ResolveDetails } from "../types.ts";
import { unavailableResolveDetails } from "./details-helpers.ts";
import { ensureSemanticReadiness, renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

export interface CodeResolveToolParams {
  query?: string;
  scope?: string;
  kind?: string;
  file?: string;
  line?: number;
  character?: number;
  maxResults?: number;
}

export async function executeResolveTool(
  params: CodeResolveToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  // Validation (defensive — TypeBox schema should catch most cases)
  const validationError = validateResolveParams(params);
  if (validationError) {
    return {
      content: validationError,
      details: unavailableResolveDetails([
        "Fix the input parameters and retry",
        "Use anchored `file` + `line` + `character` or a `query` for resolution",
      ]),
    };
  }

  const scopeResolution = resolveScope(params.scope, ctx.cwd);
  if (scopeResolution.kind === "error") {
    return {
      content: `**Error:** ${scopeResolution.reason}`,
      details: unavailableResolveDetails([
        "Verify the `scope` path exists and is within the workspace",
        "Use an existing workspace-relative file or directory path",
      ]),
    };
  }
  const resolvedScope = params.scope ? scopeResolution.path : undefined;

  const needsSemanticWarmup =
    Boolean(params.query) && params.kind !== "file" && params.kind !== "File";
  if (needsSemanticWarmup) {
    const readiness = await ensureSemanticReadiness(ctx.cwd, { kind: "workspace" });
    if (readiness.kind === "timeout") {
      return {
        content: renderSemanticReadinessTimeout("code_resolve", 15_000),
        details: unavailableResolveDetails(["Retry shortly or check `code_health`"]),
      };
    }
    if (readiness.kind === "unavailable") {
      return {
        content: `**Error:** ${readiness.reason}`,
        details: unavailableResolveDetails(["Check `code_health` for provider status"]),
      };
    }
  }

  const result = await executeResolveService({ ...params, scope: resolvedScope }, ctx.cwd);

  const content = renderResolveResult(result, ctx.cwd);

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
        file: t.file,
        displayLine: t.displayLine,
        displayCharacter: t.displayCharacter,
        name: t.name,
        kind: t.kind,
        confidence: t.confidence,
        provenance: t.provenance,
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
      candidates: result.candidates.map((c) => ({
        targetId: c.targetId,
        name: c.name,
        kind: c.kind,
        container: c.container,
        file: c.file,
        line: c.line,
        character: c.character,
        reason: c.reason,
        rank: c.rank,
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
}
