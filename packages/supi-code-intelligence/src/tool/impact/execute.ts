/**
 * Tool executor for code_impact — blast radius and downstream impact.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { focusedToolRules } from "../infra/cross-field.ts";
import { impactErrorResult } from "../infra/error-results.ts";
import {
  expandTargetId,
  gateCapability,
  gateSemanticReadiness,
  runPipe,
  validateParams,
} from "../infra/pipeline.ts";
import { emitToolProgress } from "../infra/progress.ts";
import { renderSemanticReadinessTimeout } from "../infra/readiness-message.ts";
import { executeImpact } from "./orchestrate.ts";

export interface CodeImpactToolParams {
  targetId?: string;
  file?: string;
  line?: number;
  character?: number;
  symbol?: string;
  exportedOnly?: boolean;
  maxResults?: number;
  change?: string;
  changeSetFiles?: string[];
  includeTests?: boolean;
}

/** Execute the public code_impact tool. */
export async function executeImpactTool(
  params: CodeImpactToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  emitToolProgress(ctx.onUpdate, "code_impact: analyzing blast radius...");

  const hasChangeSetInputs = (params.changeSetFiles?.length ?? 0) > 0 || Boolean(params.change);

  return runPipe(
    params,
    ctx,
    [
      expandTargetId((msg) =>
        impactErrorResult(msg, { nextQueries: ["Use `code_resolve` to resolve a target first"] }),
      ),
      validateParams(focusedToolRules(), (msg) =>
        impactErrorResult(msg, { nextQueries: ["Fix the input parameters and retry"] }),
      ),
      // Semantic readiness and capability only for target-based (non-changeSet) impact
      ...(!hasChangeSetInputs
        ? [
            gateSemanticReadiness("code_impact", {
              fileParam: "file",
              onTimeout: () =>
                impactErrorResult(renderSemanticReadinessTimeout("code_impact", 15_000), {
                  nextQueries: ["Check `code_health` for LSP status"],
                }),
              onUnavailable: () =>
                impactErrorResult(
                  "**Error:** No semantic analysis provider is available for this workspace. Check `code_health` for LSP status or enable an LSP server.",
                  {
                    nextQueries: [
                      "Use `code_resolve` to resolve a target first",
                      "Check `code_health` for LSP status or enable an LSP server.",
                    ],
                  },
                ),
            }),
            gateCapability("code_impact"),
          ]
        : []),
    ],
    async (p, c) => {
      if (!p.file && !p.symbol && !hasChangeSetInputs) {
        return impactErrorResult(
          "**Error:** Impact analysis currently requires either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
          { nextQueries: ["Use `code_resolve` to resolve a target first"] },
        );
      }

      const providerState = c.session.getProviders();
      const provider = providerState.kind === "ready" ? providerState.provider : null;
      const lspService =
        providerState.kind === "ready"
          ? providerState.lspService
          : { kind: "unavailable" as const, reason: "No provider" };

      if (hasChangeSetInputs) {
        emitToolProgress(c.onUpdate, "code_impact: analyzing impact input...");
      } else {
        emitToolProgress(c.onUpdate, "code_impact: sweeping references...");
      }
      return executeImpact(p, { cwd: c.cwd, provider, lspService });
    },
  );
}
