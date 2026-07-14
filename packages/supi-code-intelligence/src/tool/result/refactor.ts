import type { WorkspaceEdit } from "@mrclrchtr/supi-code-runtime/api";
import { createEvidenceList } from "../../analysis/evidence.ts";
import type { ApplyResult } from "../../analysis/refactor/apply.ts";
import { assembledNextQueries, assembleToolResult, type ToolResultAssembly } from "./assembly.ts";
import type { SearchDetails } from "./types.ts";

export interface RefactorResultAssembly<T> {
  readonly assembled: ToolResultAssembly<T>;
  readonly details: SearchDetails;
}

export function assembleRefactorPlanDetails(
  edits: WorkspaceEdit,
  planId: string,
  maxResults = 5,
): RefactorResultAssembly<WorkspaceEdit> {
  const editEvidence = createEvidenceList({
    key: "refactor.edits",
    items: edits.edits,
    maxResults,
  }).metadata;
  const nextQueries = [`Use code_refactor_apply with planId: "${planId}" to apply this refactor`];
  const provenance = [{ source: "semantic" as const, capability: "LSP refactor" }];
  const assembled = assembleToolResult({
    data: edits,
    sections: [
      {
        key: "refactor.edits",
        title: "Proposed edits",
        status: "complete",
        items: edits.edits,
        confidence: "semantic",
        provenance,
      },
    ],
    evidenceLists: [editEvidence],
    nextQueries,
    candidateCount: edits.edits.length,
    confidence: "semantic",
    provenance,
  });

  return {
    assembled,
    details: {
      confidence: "semantic",
      scope: null,
      candidateCount: edits.edits.length,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  };
}

export function assembleRefactorApplyDetails(
  applyResult: ApplyResult,
): RefactorResultAssembly<ApplyResult> {
  const candidateCount = applyResult.kind === "applied" ? applyResult.totalEdits : 0;
  const provenance = [{ source: "runtime" as const, capability: "file-mutation-queue" }];
  const assembled = assembleToolResult({
    data: applyResult,
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
    nextQueries: ["Use code_health to check for new issues after the refactor"],
    candidateCount,
    confidence: applyResult.kind === "applied" ? "semantic" : "unavailable",
    provenance,
  });

  return {
    assembled,
    details: {
      confidence: assembled.confidence,
      scope: null,
      candidateCount,
      omittedCount: assembled.totals.omittedCount,
      evidenceLists: [...assembled.evidenceLists],
      nextQueries: assembledNextQueries(assembled),
    },
  };
}
