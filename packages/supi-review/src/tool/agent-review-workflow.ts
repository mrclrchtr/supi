import {
  checkReviewSnapshotFreshness,
  fingerprintReviewSnapshot,
  resolveReviewSnapshot,
  summarizeReviewSnapshot,
} from "../git.ts";
import { BRIEF_SYNTHESIS_PROMPT_VERSION, synthesizeReviewBrief } from "../history/synthesize.ts";
import { normalizeReviewResult } from "../review-result.ts";
import type { ReviewPlanStore, StoredAgentReviewPlan } from "../session/review-plan-store.ts";
import { buildReviewPacket } from "../target/packet.ts";
import type {
  AgentReviewBatchDetails,
  AgentReviewerResult,
  BriefCritique,
  BriefEvaluation,
  BriefSynthesisRunResult,
  ReviewerAssignment,
  ReviewerAssignmentResult,
  ReviewModelSelection,
  ReviewProgress,
  ReviewResult,
  ReviewTargetSpec,
  SynthesizedReviewBrief,
} from "../types.ts";
import { createUnobservedChildFailureDiagnostics } from "./child-failure-diagnostics.ts";
import { runReviewer } from "./review-runner.ts";
/** Inputs required to synthesize and retain one agent-driven review plan. */
export interface PrepareAgentReviewWorkflowInput {
  cwd: string;
  target: ReviewTargetSpec;
  note?: string;
  serializedContext: string;
  model: ReviewModelSelection;
  signal?: AbortSignal;
  onProgress?: (progress: ReviewProgress) => void;
  planStore: ReviewPlanStore;
}
/** Typed preparation outcome before any reviewer child session starts. */
export type PrepareAgentReviewWorkflowOutcome =
  | { kind: "prepared"; plan: StoredAgentReviewPlan }
  | { kind: "no-snapshot"; reason: string }
  | { kind: "synthesis-failed"; result: Exclude<BriefSynthesisRunResult, { kind: "success" }> };
/** Inputs required to critique and execute one prepared review plan. */
export interface RunAgentReviewWorkflowInput {
  cwd: string;
  planId: string;
  critique: BriefCritique;
  revisedBrief?: Omit<SynthesizedReviewBrief, "note">;
  reviewers: ReviewerAssignment[];
  signal?: AbortSignal;
  onBriefEvaluation?: (evaluation: BriefEvaluation) => void;
  onReviewerProgress?: (reviewerId: string, progress: ReviewProgress) => void;
  onReviewerDone?: (reviewerId: string) => void;
  planStore: ReviewPlanStore;
}
/** Typed batch outcome after validation and snapshot freshness checks. */
export type RunAgentReviewWorkflowOutcome =
  | { kind: "completed"; details: AgentReviewBatchDetails }
  | { kind: "invalid"; reason: string }
  | { kind: "stale"; reason: string };
/** Prepare one session-scoped review plan without starting reviewer sessions. */
export async function prepareAgentReviewPlan(
  input: PrepareAgentReviewWorkflowInput,
): Promise<PrepareAgentReviewWorkflowOutcome> {
  const snapshot = await resolveReviewSnapshot(input.cwd, input.target);
  if (!snapshot) {
    return {
      kind: "no-snapshot",
      reason: `No reviewable changes found for ${formatTarget(input.target)}.`,
    };
  }

  let synthesis: BriefSynthesisRunResult;
  try {
    synthesis = await synthesizeReviewBrief({
      model: input.model,
      cwd: input.cwd,
      snapshot,
      serializedContext: input.serializedContext,
      note: input.note,
      signal: input.signal,
      onProgress: input.onProgress,
    });
  } catch {
    return {
      kind: "synthesis-failed",
      result: {
        kind: "failed",
        failureCode: "unexpected-runner-failure",
        diagnostics: createUnobservedChildFailureDiagnostics(),
      },
    };
  }
  if (synthesis.kind !== "success") {
    return { kind: "synthesis-failed", result: synthesis };
  }

  const generatedBrief: SynthesizedReviewBrief = {
    ...synthesis.brief,
    note: input.note,
  };
  const snapshotFingerprint = await fingerprintReviewSnapshot(input.cwd, snapshot, input.signal);
  const plan = input.planStore.create({
    snapshot,
    snapshotFingerprint,
    generatedBrief,
    model: input.model,
    briefPromptVersion: BRIEF_SYNTHESIS_PROMPT_VERSION,
  });
  return { kind: "prepared", plan };
}

/** Validate, atomically consume, freshness-check, and execute one prepared review batch. */
export async function runAgentReviewBatch(
  input: RunAgentReviewWorkflowInput,
): Promise<RunAgentReviewWorkflowOutcome> {
  const plan = input.planStore.get(input.planId);
  if (!plan) {
    return {
      kind: "invalid",
      reason: `Review plan "${input.planId}" was not found in this session.`,
    };
  }

  const validation = validateRunInput(input, plan);
  if (validation.kind === "invalid") return validation;

  const claimedPlan = input.planStore.take(input.planId);
  if (!claimedPlan) {
    return {
      kind: "invalid",
      reason: `Review plan "${input.planId}" has already been consumed.`,
    };
  }

  const evaluation: BriefEvaluation = {
    planId: claimedPlan.id,
    briefPromptVersion: claimedPlan.briefPromptVersion,
    generatedBrief: claimedPlan.generatedBrief,
    critique: validation.critique,
    effectiveBrief: validation.effectiveBrief,
    synthesizerModelId: claimedPlan.model.canonicalId,
    snapshotFingerprint: claimedPlan.snapshotFingerprint,
  };
  input.onBriefEvaluation?.(evaluation);

  const freshness = await checkReviewSnapshotFreshness(
    input.cwd,
    claimedPlan.snapshot,
    claimedPlan.snapshotFingerprint,
    input.signal,
  );
  if (!freshness.fresh) return { kind: "stale", reason: freshness.reason };

  const results = await Promise.all(
    validation.reviewers.map(async (assignment) => {
      const result = await runAssignment(assignment, claimedPlan, validation.effectiveBrief, input);
      input.onReviewerDone?.(assignment.id);
      return result;
    }),
  );

  const finalFreshness = await checkReviewSnapshotFreshness(
    input.cwd,
    claimedPlan.snapshot,
    claimedPlan.snapshotFingerprint,
    input.signal,
  );
  if (!finalFreshness.fresh) {
    return {
      kind: "stale",
      reason: "The review target changed while reviewer sessions were running. Prepare a new plan.",
    };
  }

  return {
    kind: "completed",
    details: {
      kind: "review-batch",
      evaluation,
      snapshot: summarizeReviewSnapshot(claimedPlan.snapshot),
      results,
    },
  };
}

async function runAssignment(
  assignment: ReviewerAssignment,
  plan: StoredAgentReviewPlan,
  effectiveBrief: SynthesizedReviewBrief,
  input: RunAgentReviewWorkflowInput,
): Promise<ReviewerAssignmentResult> {
  const packet = buildReviewPacket(plan.snapshot, effectiveBrief, plan.model, assignment);

  try {
    const rawResult = await runReviewer({
      prompt: packet.prompt,
      model: plan.model,
      cwd: input.cwd,
      signal: input.signal,
      snapshot: plan.snapshot,
      brief: effectiveBrief,
      onProgress: (progress) => input.onReviewerProgress?.(assignment.id, progress),
    });
    return { assignment, result: compactReviewResult(normalizeReviewResult(rawResult)) };
  } catch {
    return {
      assignment,
      result: {
        kind: "failed",
        failureCode: "unexpected-runner-failure",
        modelId: plan.model.canonicalId,
        diagnostics: createUnobservedChildFailureDiagnostics(),
      },
    };
  }
}

function compactReviewResult(result: ReviewResult): AgentReviewerResult {
  switch (result.kind) {
    case "success":
      return { kind: "success", output: result.output, modelId: result.modelId };
    case "failed":
      return result.failureCode === "session-creation-failed"
        ? {
            kind: "failed",
            failureCode: result.failureCode,
            modelId: result.modelId,
          }
        : {
            kind: "failed",
            failureCode: result.failureCode,
            modelId: result.modelId,
            diagnostics: result.diagnostics,
          };
    case "canceled":
      return {
        kind: "canceled",
        modelId: result.modelId,
        diagnostics: result.diagnostics,
      };
    case "timeout":
      return {
        kind: "timeout",
        timeoutMs: result.timeoutMs,
        modelId: result.modelId,
        diagnostics: result.diagnostics,
      };
  }
}

function validateRunInput(
  input: RunAgentReviewWorkflowInput,
  plan: StoredAgentReviewPlan,
):
  | {
      kind: "valid";
      critique: BriefCritique;
      effectiveBrief: SynthesizedReviewBrief;
      reviewers: ReviewerAssignment[];
    }
  | { kind: "invalid"; reason: string } {
  if (input.critique.verdict === "revise" && !input.revisedBrief) {
    return {
      kind: "invalid",
      reason: 'revisedBrief is required when critique.verdict is "revise".',
    };
  }
  if (input.critique.verdict === "accept" && input.revisedBrief) {
    return {
      kind: "invalid",
      reason: 'revisedBrief must be omitted when critique.verdict is "accept".',
    };
  }

  const critiqueResult = normalizeBriefCritique(input.critique);
  if (critiqueResult.kind === "invalid") return critiqueResult;
  const critique = critiqueResult.critique;

  if (input.reviewers.length < 1 || input.reviewers.length > 4) {
    return { kind: "invalid", reason: "Provide between one and four reviewer assignments." };
  }

  const reviewers = input.reviewers.map((assignment) => ({
    id: assignment.id.trim(),
    focus: assignment.focus.trim(),
  }));
  const invalidAssignment = reviewers.find((assignment) => !assignment.id || !assignment.focus);
  if (invalidAssignment) {
    return { kind: "invalid", reason: "Reviewer ids and focus instructions must not be blank." };
  }
  const ids = new Set(reviewers.map((assignment) => assignment.id));
  if (ids.size !== reviewers.length) {
    return { kind: "invalid", reason: "Reviewer assignment ids must be unique." };
  }

  const effectiveBriefResult = input.revisedBrief
    ? normalizeRevisedBrief(input.revisedBrief, plan.generatedBrief.note)
    : { kind: "valid" as const, brief: plan.generatedBrief };
  if (effectiveBriefResult.kind === "invalid") return effectiveBriefResult;
  const effectiveBrief = effectiveBriefResult.brief;
  const invalidRiskyFile = effectiveBrief.riskyFiles.find(
    (file) => !plan.snapshot.changedFiles.includes(file),
  );
  if (invalidRiskyFile) {
    return {
      kind: "invalid",
      reason: `Revised brief riskyFiles contains "${invalidRiskyFile}", which is not in the prepared snapshot.`,
    };
  }

  return { kind: "valid", critique, effectiveBrief, reviewers };
}

function normalizeBriefCritique(
  input: BriefCritique,
): { kind: "valid"; critique: BriefCritique } | { kind: "invalid"; reason: string } {
  if (input.findings.length > 20) {
    return { kind: "invalid", reason: "Brief critique supports at most 20 findings." };
  }
  if (input.verdict === "revise" && input.findings.length === 0) {
    return {
      kind: "invalid",
      reason: 'critique.findings must contain evidence when critique.verdict is "revise".',
    };
  }

  const critique: BriefCritique = {
    verdict: input.verdict,
    summary: input.summary.trim(),
    findings: input.findings.map((finding) => ({
      ...finding,
      explanation: finding.explanation.trim(),
      evidence: finding.evidence.trim(),
      proposedChange: finding.proposedChange.trim(),
    })),
  };
  if (!critique.summary) {
    return { kind: "invalid", reason: "Brief critique summary must not be blank." };
  }
  if (
    critique.findings.some(
      (finding) => !finding.explanation || !finding.evidence || !finding.proposedChange,
    )
  ) {
    return { kind: "invalid", reason: "Brief critique findings must contain non-blank text." };
  }
  return { kind: "valid", critique };
}

function normalizeRevisedBrief(
  brief: Omit<SynthesizedReviewBrief, "note">,
  note: string | undefined,
): { kind: "valid"; brief: SynthesizedReviewBrief } | { kind: "invalid"; reason: string } {
  const summary = brief.summary.trim();
  const intendedOutcome = brief.intendedOutcome.trim();
  if (!summary || !intendedOutcome) {
    return {
      kind: "invalid",
      reason: "revisedBrief.summary and revisedBrief.intendedOutcome must not be blank.",
    };
  }

  const constraints = brief.constraints.map((item) => item.trim());
  const focusAreas = brief.focusAreas.map((item) => item.trim());
  const riskyFiles = brief.riskyFiles.map((item) => item.trim());
  const unresolvedQuestions = brief.unresolvedQuestions.map((item) => item.trim());
  if (
    [...constraints, ...focusAreas, ...riskyFiles, ...unresolvedQuestions].some((item) => !item)
  ) {
    return { kind: "invalid", reason: "revisedBrief arrays must not contain blank entries." };
  }

  return {
    kind: "valid",
    brief: {
      summary,
      intendedOutcome,
      constraints,
      focusAreas,
      riskyFiles,
      unresolvedQuestions,
      reviewInstructionBlockIds: [...brief.reviewInstructionBlockIds],
      note,
    },
  };
}

function formatTarget(target: ReviewTargetSpec): string {
  switch (target.kind) {
    case "working-tree":
      return "the working tree";
    case "branch":
      return `changes against ${target.base}`;
    case "commit":
      return `commit ${target.sha}`;
  }
}
