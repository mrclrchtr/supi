/**
 * Tool executor for code_impact — blast radius and downstream impact.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../types.ts";
import { executeImpact } from "../use-case/generate-impact.ts";
import { unavailableImpactDetails } from "./details-helpers.ts";
import { focusedToolRules } from "./cross-field.ts";
import {
  expandTargetId,
  gateCapability,
  gateSemanticReadiness,
  runPipe,
  validateParams,
} from "./pipeline.ts";
import { emitToolProgress } from "./progress.ts";
import { renderSemanticReadinessTimeout } from "./semantic-readiness.ts";

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
      expandTargetId((msg) => ({
        content: msg,
        details: unavailableImpactDetails(["Use `code_resolve` to resolve a target first"]),
      })),
      validateParams(focusedToolRules(), (msg) => ({
        content: msg,
        details: unavailableImpactDetails(["Fix the input parameters and retry"]),
      })),
      // Semantic readiness and capability only for target-based (non-changeSet) impact
      ...(!hasChangeSetInputs
        ? [
            gateSemanticReadiness("code_impact", {
              fileParam: "file",
              onTimeout: () => ({
                content: renderSemanticReadinessTimeout("code_impact", 15_000),
                details: unavailableImpactDetails(["Check `code_health` for LSP status"]),
              }),
              onUnavailable: () => ({
                content:
                  "**Error:** No semantic analysis provider is available for this workspace. Check `code_health` for LSP status or enable an LSP server.",
                details: unavailableImpactDetails([
                  "Use `code_resolve` to resolve a target first",
                  "Check `code_health` for LSP status or enable an LSP server.",
                ]),
              }),
            }),
            gateCapability("code_impact"),
          ]
        : []),
    ],
    async (p, c) => {
      if (!p.file && !p.symbol && !hasChangeSetInputs) {
        return {
          content:
            "**Error:** Impact analysis currently requires either anchored coordinates (`file`, `line`, `character`) or a `symbol` for discovery.",
          details: unavailableImpactDetails(["Use `code_resolve` to resolve a target first"]),
        };
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
