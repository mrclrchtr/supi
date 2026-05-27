/**
 * Tool executor for code_refactor_plan.
 *
 * Preview-only semantic rename. Does not mutate files.
 * Returns a plan ID for later use with code_refactor_apply.
 */

import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { toLspPosition } from "@mrclrchtr/supi-lsp/api";
import {
  computeFileFingerprint,
  generatePlanId,
  type RefactorPlan,
  storePlan,
} from "../analysis/refactor/plan-store.ts";
import { validateEdit } from "../analysis/refactor/safety.ts";
import { routeFor } from "../planner/planner.ts";
import { renderRefactorPlanResult } from "../presentation/markdown/refactor.ts";
import { normalizePath } from "../search-helpers.ts";
import type { CodeIntelResult } from "../types.ts";

export interface CodeRefactorPlanToolParams {
  operation: string;
  file: string;
  line: number;
  character: number;
  newName: string;
}

export async function executeRefactorPlanTool(
  params: CodeRefactorPlanToolParams,
  ctx: { cwd: string },
): Promise<CodeIntelResult> {
  if (params.operation !== "rename") {
    return {
      content: `**Error:** Unsupported refactor operation: "${params.operation}". Currently only "rename" is supported.`,
      details: undefined,
    };
  }

  const route = routeFor(ctx.cwd, "code_refactor_plan");
  if (route.preferred === "unavailable") {
    return {
      content:
        "**Error:** No refactor-capable semantic provider is available. Ensure an LSP server is configured and running.",
      details: undefined,
    };
  }

  const runtime = getDefaultWorkspaceRuntime();
  const ws = runtime.getWorkspace(ctx.cwd);
  const provider = ws.semantic.provider;
  if (!provider?.rename) {
    return {
      content: "**Error:** The active semantic provider does not support rename operations.",
      details: undefined,
    };
  }

  const resolvedFile = normalizePath(params.file, ctx.cwd);
  const refactorResult = await provider.rename(
    resolvedFile,
    toLspPosition(params.line, params.character),
    params.newName,
  );

  if (refactorResult.kind === "unavailable") {
    return {
      content: `**Refactor unavailable:** ${refactorResult.reason}`,
      details: undefined,
    };
  }

  if (refactorResult.kind === "ambiguous") {
    const candidates = refactorResult.candidates
      .map((c, i) => `${i + 1}. ${c.description} (${c.file}:${c.line})`)
      .join("\n");
    return {
      content: `**Refactor ambiguous:** Multiple matching targets found. Please disambiguate:\n${candidates}`,
      details: undefined,
    };
  }

  // Validate the edit
  const validation = validateEdit(refactorResult.edits);
  if (!validation.safe) {
    return {
      content: `**Refactor safety check failed:** ${validation.reason}`,
      details: undefined,
    };
  }

  // Compute file fingerprints
  const fileFingerprints = refactorResult.edits.edits.map((edit) => ({
    file: edit.file,
    fingerprint: computeFileFingerprint(edit.file),
  }));

  // Generate and store the plan
  const planId = generatePlanId(
    params.operation,
    resolvedFile,
    params.line,
    params.character,
    params.newName,
  );

  const plan: RefactorPlan = {
    id: planId,
    operation: params.operation,
    newName: params.newName,
    targetFile: resolvedFile,
    targetLine: params.line,
    targetCharacter: params.character,
    edits: refactorResult.edits,
    fileFingerprints,
    createdAt: Date.now(),
  };
  storePlan(plan);

  const content = renderRefactorPlanResult(plan);

  return {
    content,
    details: {
      type: "search" as const,
      data: {
        confidence: "semantic" as const,
        scope: null,
        candidateCount: refactorResult.edits.edits.length,
        omittedCount: 0,
        nextQueries: [`Use code_refactor_apply with planId: "${planId}" to apply this rename`],
      },
    },
  };
}
