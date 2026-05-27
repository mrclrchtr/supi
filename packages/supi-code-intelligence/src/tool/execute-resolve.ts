/**
 * Tool executor for code_resolve.
 *
 * Calls the resolve service and renders compact markdown with stable
 * target handles and follow-up suggestions.
 */

import { executeResolveService, validateResolveParams } from "../analysis/resolve/service.ts";
import { renderResolveResult } from "../presentation/markdown/resolve.ts";
import type { CodeIntelResult, ResolveDetails } from "../types.ts";

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
    return { content: validationError, details: undefined };
  }

  const result = await executeResolveService(params, ctx.cwd);

  const content = renderResolveResult(result, ctx.cwd);

  // Build structured details
  if (result.kind === "resolved") {
    const details: ResolveDetails = {
      confidence: result.confidence,
      targetCount: result.targets.length,
      omittedCount: result.omittedCount,
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
      targetCount: 0,
      omittedCount: result.omittedCount,
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

  // Error — no details
  return { content, details: undefined };
}
