/**
 * Tool executor for the preview-only refactor planning path.
 *
 * Thin executor: validates semantic readiness via pipeline, then delegates
 * to the refactor plan use-case for operation normalization, target resolution,
 * provider interaction, and plan storage. Returns a planId for code_refactor_apply.
 */

import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import { gateSemanticReadiness, runPipe } from "../infra/pipeline.ts";
import { renderSemanticReadinessTimeout } from "../infra/readiness-message.ts";
import { executeRefactorPlan } from "./orchestrate.ts";

export interface CodeRefactorPlanToolParams {
  targetId?: string;
  operation: string;
  file?: string;
  line?: number;
  character?: number;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  newName?: string;
}

export async function executeRefactorPlanTool(
  params: CodeRefactorPlanToolParams,
  ctx: CodeIntelToolExecCtx,
  invokedAs: "code_refactor_plan" = "code_refactor_plan",
): Promise<CodeIntelResult> {
  return runPipe(
    params,
    ctx,
    [
      gateSemanticReadiness("code_refactor_plan", {
        fileParam: "file",
        onTimeout: () => ({
          content: renderSemanticReadinessTimeout(invokedAs, 15_000),
          details: {
            type: "search" as const,
            data: {
              confidence: "unavailable" as const,
              scope: null,
              candidateCount: 0,
              omittedCount: 0,
              nextQueries: ["Retry shortly or check `code_health`"],
            },
          },
        }),
        throwOnUnavailable: true,
      }),
    ],
    async (_p, c) => {
      return executeRefactorPlan(
        {
          targetId: params.targetId,
          operation: params.operation,
          file: params.file,
          line: params.line,
          character: params.character,
          range: params.range,
          newName: params.newName,
        },
        {
          cwd: c.cwd,
          session: c.session,
          provider: c.session.getSemanticProvider(),
        },
      );
    },
  );
}
