import type { FileEdit } from "@mrclrchtr/supi-code-runtime/api";
import { createEvidenceList, type EvidenceList } from "../../analysis/evidence.ts";
import type { ApplyResult } from "../../analysis/refactor/apply.ts";
import type { RefactorPlan } from "../../session/refactor-plans.ts";
import { assembledNextQueries, assembleToolResult, type ToolResultAssembly } from "./assembly.ts";
import type { SearchDetails } from "./types.ts";

export interface RefactorPlanAssemblyData {
  readonly plan: Readonly<RefactorPlan>;
  readonly cwd: string;
  readonly edits: EvidenceList<FileEdit>;
}

export interface RefactorPlanResultAssembly {
  readonly assembled: ToolResultAssembly<RefactorPlanAssemblyData>;
  readonly details: SearchDetails;
}

export interface RefactorApplyAssemblyData {
  readonly plan: Readonly<RefactorPlan>;
  readonly result: Readonly<ApplyResult>;
}

export interface RefactorApplyResultAssembly {
  readonly assembled: ToolResultAssembly<RefactorApplyAssemblyData>;
  readonly details: SearchDetails;
}

/** Assemble a bounded refactor plan and all facts needed by its renderers. */
export function assembleRefactorPlanDetails(
  plan: Readonly<RefactorPlan>,
  cwd: string,
  maxResults = 5,
): RefactorPlanResultAssembly {
  const edits = createEvidenceList({
    key: "refactor.edits",
    items: [...plan.edits.edits],
    maxResults,
  });
  const provenance = [{ source: "semantic" as const, capability: "LSP refactor" }];
  const assembled = assembleToolResult({
    data: { plan, cwd, edits },
    sections: [
      {
        key: "refactor.edits",
        title: "Proposed edits",
        status: "complete",
        items: edits.items,
        confidence: "semantic",
        provenance,
      },
    ],
    evidenceLists: [edits.metadata],
    nextQueries: [`Use code_refactor_apply with planId: "${plan.id}" to apply this refactor`],
    candidateCount: edits.metadata.totalCount ?? edits.metadata.shownCount,
    confidence: "semantic",
    provenance,
  });

  return {
    assembled,
    details: {
      confidence: assembled.confidence,
      scope: null,
      candidateCount: assembled.totals.candidateCount,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  };
}

/** Assemble a refactor apply outcome with the originating plan and follow-up action. */
export function assembleRefactorApplyDetails(
  applyResult: ApplyResult,
  plan: Readonly<RefactorPlan>,
): RefactorApplyResultAssembly {
  const candidateCount = applyResult.kind === "applied" ? applyResult.totalEdits : 0;
  const provenance = [{ source: "runtime" as const, capability: "file-mutation-queue" }];
  const assembled = assembleToolResult({
    data: { plan, result: applyResult },
    sections: [
      {
        key: "refactor.apply",
        title: "Applied edits",
        status: applyResult.kind === "applied" ? "complete" : "unavailable",
        items: applyResult.kind === "applied" ? [applyResult] : [],
        confidence: applyResult.kind === "applied" ? "semantic" : "unavailable",
        provenance,
      },
    ],
    nextQueries:
      applyResult.kind === "applied"
        ? ["Use code_health to check for new issues after the refactor"]
        : [],
    candidateCount,
    confidence: applyResult.kind === "applied" ? "semantic" : "unavailable",
    provenance,
  });

  return {
    assembled,
    details: {
      confidence: assembled.confidence,
      scope: null,
      candidateCount: assembled.totals.candidateCount,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
      ...(applyResult.kind === "applied"
        ? { changedFiles: [...new Set(plan.edits.edits.map((edit) => edit.file))] }
        : {}),
    },
  };
}
