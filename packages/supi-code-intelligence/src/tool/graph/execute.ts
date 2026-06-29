/**
 * Tool executor for code_graph.
 *
 * Unified relation-graph tool — replaces code_references, code_calls,
 * and code_implementations. Resolves one target, then dispatches to the
 * appropriate analysis service per requested relation.
 *
 * Thin executor: validates params via pipeline, then delegates to the
 * graph use-case for target resolution, data collection, and rendering.
 */

import type { AnchorKind } from "../../session/target-store.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { composeRules, focusedToolRules, requireAtLeastOne } from "../infra/cross-field.ts";
import { searchErrorResult } from "../infra/error-results.ts";
import {
  expandTargetId,
  gateCapability,
  resolveScopeParam,
  runPipe,
  validateParams,
} from "../infra/pipeline.ts";
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
  /** Set by pipeline expandTargetId stage. */
  _expandedName?: string | null;
  /** Set by pipeline expandTargetId stage. */
  _expandedAnchorKind?: string | null;
}

export async function executeGraphTool(
  params: CodeGraphToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  emitToolProgress(ctx.onUpdate, "code_graph: resolving target...");

  return runPipe(
    params,
    ctx,
    [
      expandTargetId((msg) => searchErrorResult(msg)),
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
