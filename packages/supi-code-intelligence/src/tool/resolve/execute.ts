/**
 * Tool executor for code_resolve.
 *
 * Thin adapter: validates params, gates readiness, delegates to orchestrate.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { resolveCrossFieldRules } from "../infra/cross-field.ts";
import { unavailableResolveDetails } from "../infra/error-results.ts";
import {
  expandTargetId,
  gateSemanticReadiness,
  resolveScopeParam,
  runPipe,
  validateParams,
} from "../infra/pipeline.ts";
import { renderSemanticReadinessTimeout } from "../infra/readiness-message.ts";
import { orchestrateResolve } from "./orchestrate.ts";

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
      return orchestrateResolve({
        params: { ...p, scope: p.scope },
        session: c.session,
        cwd: c.cwd,
      });
    },
  );
}
