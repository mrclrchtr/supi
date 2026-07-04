/**
 * Tool executor for code_graph.
 *
 * Unified relation-graph tool — replaces code_references, code_calls,
 * and code_implementations. Resolves one target, then dispatches to the
 * appropriate analysis service per requested relation.
 *
 * Thin executor: resolves target via session target workflow (deep seam),
 * validates params via pipeline, then delegates to the graph use-case.
 */

import type { AnchorKind } from "../../session/target-store.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { composeRules, focusedToolRules, requireAtLeastOne } from "../infra/cross-field.ts";
import { searchErrorResult } from "../infra/error-results.ts";
import { gateCapability, resolveScopeParam, runPipe, validateParams } from "../infra/pipeline.ts";
import { emitToolProgress } from "../infra/progress.ts";
import { executeGraph } from "./orchestrate.ts";

/** Relation kinds accepted by code_graph. */
export type GraphRelation =
  | "references"
  | "callees"
  | "imports"
  | "exports"
  | "implements"
  | "tests"
  | "all";

export interface CodeGraphToolParams {
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  scope?: string;
  relations?: GraphRelation[];
  calleeDepth?: "direct" | "deep";
  maxResults?: number;
  /** Set by target-workflow resolution. */
  _expandedName?: string | null;
  /** Set by target-workflow resolution. */
  _expandedAnchorKind?: string | null;
}

/** Graph target-workflow policy: no file-level targets, name anchor optional. */
const GRAPH_TARGET_POLICY = {
  fileLevelAllowed: false,
  nameAnchorRequired: false,
  waitForSemantic: false,
} as const;

export async function executeGraphTool(
  params: CodeGraphToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  emitToolProgress(ctx.onUpdate, "code_graph: resolving target...");

  // ── Deep seam: resolve targetId through the session target workflow ──
  // Replaces expandTargetId pipeline stage. Anchored coordinates and
  // symbol queries still use the orchestrate's own resolution.
  if (params.targetId) {
    const outcome = await ctx.session.resolveTarget(
      { targetId: params.targetId },
      GRAPH_TARGET_POLICY,
    );

    if (outcome.kind === "resolved") {
      params.file = outcome.entry.file;
      params.line = outcome.entry.displayLine;
      params.character = outcome.entry.displayCharacter;
      params._expandedName = outcome.entry.name;
      params._expandedAnchorKind = outcome.entry.anchorKind;
      // targetId wins — drop conflicting scope to avoid validation error
      params.scope = undefined;
    } else if (outcome.kind !== "no-target") {
      const msg =
        outcome.kind === "invalid-input"
          ? outcome.message
          : outcome.kind === "unavailable"
            ? outcome.reason
            : "Target resolution failed. Verify the targetId is valid.";
      return searchErrorResult(`**Error:** ${msg}`);
    }
  }

  return runPipe(
    params,
    ctx,
    [
      resolveScopeParam((reason) => searchErrorResult(`**Error:** ${reason}`)),
      validateParams(
        composeRules(focusedToolRules(), requireAtLeastOne("file", "symbol", "scope")),
        (msg) => searchErrorResult(msg),
      ),
      gateCapability("code_graph"),
    ],
    async (p, c) => {
      emitToolProgress(c.onUpdate, "code_graph: collecting relations...");
      return executeGraph(
        {
          targetId: p.targetId,
          file: p.file,
          line: p.line,
          character: p.character,
          symbol: p.symbol,
          scope: p.scope,
          relations: p.relations,
          calleeDepth: p.calleeDepth,
          maxResults: p.maxResults,
          _expandedName: p._expandedName,
          _expandedAnchorKind: p._expandedAnchorKind as AnchorKind | undefined,
        },
        {
          cwd: c.cwd,
          session: c.session,
          provider: c.session.getProvider(),
          onUpdate: c.onUpdate,
        },
      );
    },
  );
}
