import type { WorkspaceEdit } from "@mrclrchtr/supi-code-runtime/api";
import { createEvidenceList } from "../../analysis/evidence.ts";
import type { ApplyResult } from "../refactor-apply/apply.ts";
import type { SearchDetails } from "./types.ts";

export function assembleRefactorPlanDetails(
  edits: WorkspaceEdit,
  planId: string,
  maxResults = 5,
): SearchDetails {
  const editEvidence = createEvidenceList({
    key: "refactor.edits",
    items: edits.edits,
    maxResults,
  }).metadata;

  return {
    confidence: "semantic",
    scope: null,
    candidateCount: edits.edits.length,
    omittedCount: editEvidence.omittedCount ?? 0,
    evidenceLists: [editEvidence],
    nextQueries: [`Use code_refactor_apply with planId: "${planId}" to apply this refactor`],
  };
}

export function assembleRefactorApplyDetails(applyResult: ApplyResult): SearchDetails {
  return {
    confidence: "semantic",
    scope: null,
    candidateCount: applyResult.kind === "applied" ? applyResult.totalEdits : 0,
    omittedCount: 0,
    nextQueries: ["`code_health` to check for new issues after the refactor"],
  };
}
