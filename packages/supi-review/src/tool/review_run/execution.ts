import { randomUUID } from "node:crypto";
import {
  type AgentRunAuxiliaryModelSnapshot,
  type AgentRunProviderAuthority,
  type AgentRunRegistry,
  createUnobservedAgentRunDiagnostics,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { ChildWebToolProvision } from "@mrclrchtr/supi-core/session";
import { normalizeReviewInput } from "../../review-input.ts";
import type { ReviewTargetDiffFile } from "../../target/diff.ts";
import type { ReviewInstructionFiles } from "../../target/instruction-files.ts";
import { buildReviewPacket, type ReviewPacketWorkspace } from "../../target/packet.ts";
import {
  clampReviewThinkingLevel,
  REVIEWER_DEFAULT_THINKING_LEVEL,
  type ReviewThinkingLevel,
} from "../../thinking.ts";
import type {
  ReviewerAuditRequest,
  ReviewerExtensionSetStatus,
  ReviewInput,
  ReviewModelSelection,
  ReviewProgress,
  ReviewScope,
  ReviewSnapshot,
  ReviewTask,
  ReviewTaskResult,
} from "../../types.ts";
import { recordReviewTaskDebugSummary } from "./debug-summary.ts";
import type { InstructionFileUsage } from "./instruction-usage.ts";
import { runReviewer } from "./runner.ts";
import { normalizeReviewSubmission } from "./submission.ts";

/** One task's compact state while a review batch is still running. */
export interface ReviewExecutionPartialTaskState {
  status: "waiting" | "running" | ReviewTaskResult["status"];
  progress?: ReviewProgress;
}

/** Compact progress details shared by review execution and its TUI renderer. */
export interface ReviewExecutionProgressDetails extends Record<string, unknown> {
  completedCount?: number;
  totalCount?: number;
  targetTitle?: string;
  workspacePath?: string;
  reviewerModelId?: string;
  sharedContext?: string;
  scope?: ReviewScope;
  tasks?: ReviewTask[];
  taskIds?: string[];
  taskStates?: Record<string, ReviewExecutionPartialTaskState>;
}

/**
 * Caller-owned identity of one Review's Reviewer Runs: the `/agents` batch, a run key per task,
 * and an observer for each finished task result. Generated or omitted when absent.
 */
export interface ReviewExecutionBatch {
  readonly batchId: string;
  readonly runKeys: ReadonlyMap<string, string>;
  /** Called once per task with its final result; observer errors are ignored. */
  onTaskResult?(result: ReviewTaskResult): void;
}

/** Progress callback shared by batch workflow adapters. */
export type ReviewExecutionUpdate = (result: {
  content: Array<{ type: "text"; text: string }>;
  details: ReviewExecutionProgressDetails;
}) => void;

function toTaskResult(
  task: ReviewTask,
  packetHash: string,
  result: Awaited<ReturnType<typeof runReviewer>>,
): ReviewTaskResult {
  const identity = {
    taskId: task.id,
    mode: task.mode,
    packetHash,
    modelId: result.modelId,
    requestedThinkingLevel: result.requestedThinkingLevel,
    effectiveThinkingLevel: result.effectiveThinkingLevel,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.capabilityWarnings ? { capabilityWarnings: result.capabilityWarnings } : {}),
    ...(result.submissionRecovery ? { submissionRecovery: result.submissionRecovery } : {}),
    ...(result.audit ? { audit: result.audit } : {}),
  };
  if (result.kind === "success") {
    const normalized = normalizeReviewSubmission(result.value);
    return {
      status: "completed",
      ...identity,
      verdict: normalized.verdict,
      findingCounts: normalized.findingCounts,
      summary: normalized.summary,
      findings: normalized.findings,
      criteriaCoverage: normalized.criteriaCoverage,
    };
  }
  if (result.kind === "failed") {
    return {
      status: "failed",
      ...identity,
      failureCode: result.failureCode,
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    };
  }
  if (result.kind === "canceled") {
    return { status: "canceled", ...identity, diagnostics: result.diagnostics };
  }
  return {
    status: "timeout",
    ...identity,
    timeoutMs: result.timeoutMs,
    diagnostics: result.diagnostics,
  };
}

/** The caller-owned registry run key of one task, when the caller supplied one. */
function runKeyFor(batch: ReviewExecutionBatch | undefined, taskId: string): { runKey?: string } {
  const runKey = batch?.runKeys.get(taskId);
  return runKey ? { runKey } : {};
}

function emitUpdate(
  onUpdate: ReviewExecutionUpdate | undefined,
  result: Parameters<ReviewExecutionUpdate>[0],
): void {
  try {
    onUpdate?.(result);
  } catch {
    // Progress presentation cannot change review execution semantics.
  }
}

/** Inputs of one Review Task fan-out against an already-frozen Review Workspace. */
export interface ReviewTaskExecution {
  readonly workspaceCwd: string;
  readonly snapshot: ReviewSnapshot;
  readonly review: ReviewInput;
  readonly scope: ReviewScope;
  readonly model: ReviewModelSelection;
  /** Defaults to the Reviewer default thinking level. */
  readonly reviewerThinkingLevel?: ReviewThinkingLevel;
  readonly projectTrusted?: boolean;
  readonly signal?: AbortSignal;
  readonly onUpdate?: ReviewExecutionUpdate;
  readonly audit?: ReviewerAuditRequest;
  /** Defaults to `false`. */
  readonly dependencyBootstrapConfigured?: boolean;
  readonly providerAuthority?: AgentRunProviderAuthority;
  readonly recoveryModel?: ReviewModelSelection;
  readonly recoveryModelId?: string;
  readonly registry?: AgentRunRegistry;
  /** Defaults to `false`. */
  readonly reviewerCodemodeEnabled?: boolean;
  readonly authorizedAuxiliaryModels?: AgentRunAuxiliaryModelSnapshot;
  readonly reviewerWebTools?: ChildWebToolProvision;
  readonly targetDiff?: ReviewTargetDiffFile;
  /** Repository instruction files selected at the start boundary; omitted means none. */
  readonly instructionFiles?: ReviewInstructionFiles;
  readonly batch?: ReviewExecutionBatch;
}

/** Reviewer Session options shared by every task of one fan-out. */
function sharedReviewerOptions(
  execution: ReviewTaskExecution,
  requestedThinkingLevel: ReviewThinkingLevel,
  runGroupId: string,
) {
  const {
    authorizedAuxiliaryModels,
    reviewerWebTools,
    recoveryModel,
    recoveryModelId,
    registry,
    audit,
    dependencyBootstrapConfigured,
  } = execution;
  return {
    cwd: execution.workspaceCwd,
    snapshot: execution.snapshot,
    model: execution.model,
    requestedThinkingLevel,
    reviewerCodemodeEnabled: execution.reviewerCodemodeEnabled ?? false,
    ...(authorizedAuxiliaryModels ? { authorizedAuxiliaryModels } : {}),
    ...(reviewerWebTools ? { reviewerWebTools } : {}),
    ...(recoveryModel ? { recoveryModel } : {}),
    ...(recoveryModelId ? { recoveryModelId } : {}),
    ...(registry ? { registry } : {}),
    providerAuthority: execution.providerAuthority,
    projectTrusted: execution.projectTrusted,
    ...(audit ? { audit } : {}),
    ...(dependencyBootstrapConfigured ? { dependencyBootstrapConfigured } : {}),
    signal: execution.signal,
    runGroupId,
  };
}

/** Run all caller-defined tasks concurrently against one already-frozen Review Workspace. */
export async function executeReviewTasks(
  execution: ReviewTaskExecution,
): Promise<ReviewTaskResult[]> {
  const {
    workspaceCwd,
    snapshot,
    review: reviewInput,
    scope,
    model,
    reviewerThinkingLevel = REVIEWER_DEFAULT_THINKING_LEVEL,
    onUpdate,
    dependencyBootstrapConfigured = false,
    targetDiff,
    instructionFiles,
    batch,
  } = execution;
  const review = normalizeReviewInput(reviewInput);
  let completedCount = 0;
  const totalCount = review.tasks.length;
  const effectiveThinkingLevel = clampReviewThinkingLevel(model.model, reviewerThinkingLevel);
  const runGroupId = batch?.batchId ?? randomUUID();
  const settle = (taskResult: ReviewTaskResult): ReviewTaskResult => {
    try {
      batch?.onTaskResult?.(taskResult);
    } catch {
      // Result observers cannot change review execution semantics.
    }
    return taskResult;
  };
  // Partial tool output is replaced repeatedly; retain the review context and task state for expanded views.
  const presentation = {
    targetTitle: snapshot.title,
    workspacePath: workspaceCwd,
    reviewerModelId: model.canonicalId,
    ...(review.sharedContext ? { sharedContext: review.sharedContext } : {}),
    ...(scope.paths?.length ? { scope } : {}),
    tasks: review.tasks,
    taskIds: review.tasks.map((task) => task.id),
  };
  const taskStates: Record<string, ReviewExecutionPartialTaskState> = Object.fromEntries(
    review.tasks.map((task) => [task.id, { status: "waiting" }]),
  );
  const progressDetails = () => ({
    ...presentation,
    taskStates: { ...taskStates },
    completedCount,
    totalCount,
  });
  emitUpdate(onUpdate, {
    content: [{ type: "text", text: "Reviewing frozen Review Workspace…" }],
    details: progressDetails(),
  });
  const reviewerOptions = sharedReviewerOptions(execution, reviewerThinkingLevel, runGroupId);
  const packetWorkspace: ReviewPacketWorkspace = {
    ...(targetDiff ? { targetDiff } : {}),
    dependencyBootstrapRan: dependencyBootstrapConfigured,
    ...(instructionFiles ? { instructionFiles } : {}),
  };
  // Only the embedded root file is known; headless Orientation still delivers indexed files.
  const knownInstructionPaths = instructionFiles?.root ? [instructionFiles.root.path] : [];
  const indexedInstructionPaths = instructionFiles?.indexed.map((file) => file.path) ?? [];

  return Promise.all(
    review.tasks.map(async (task) => {
      const packet = buildReviewPacket(snapshot, review, scope, task, model, packetWorkspace);
      const packetBytes = Buffer.byteLength(packet.prompt, "utf8");
      const startedAt = Date.now();
      const debugSummary = (
        taskResult: ReviewTaskResult,
        reviewerExtensionSetStatus: ReviewerExtensionSetStatus,
        instructionFileUsage?: InstructionFileUsage,
      ): void => {
        recordReviewTaskDebugSummary({
          taskId: task.id,
          mode: task.mode,
          targetTitle: snapshot.title,
          packetBytes,
          durationMs: Date.now() - startedAt,
          reviewerExtensionSetStatus,
          progress: taskStates[task.id].progress,
          result: taskResult,
          ...(instructionFileUsage ? { instructionFileUsage } : {}),
        });
      };
      taskStates[task.id] = { status: "running" };
      emitUpdate(onUpdate, {
        content: [{ type: "text", text: `Task ${task.id} started` }],
        details: progressDetails(),
      });
      try {
        const result = await runReviewer({
          ...reviewerOptions,
          task,
          prompt: packet.prompt,
          packetHash: packet.packetHash,
          ...(knownInstructionPaths.length > 0 ? { knownInstructionPaths } : {}),
          ...(indexedInstructionPaths.length > 0 ? { indexedInstructionPaths } : {}),
          ...runKeyFor(batch, task.id),
          onProgress: (progress) => {
            taskStates[task.id] = { status: "running", progress };
            emitUpdate(onUpdate, {
              content: [
                {
                  type: "text",
                  text: `Task ${task.id}: ${progress.turns} turns, ${progress.toolUses} tool uses${progress.tokens ? `, ${progress.tokens.total} tokens` : ""}`,
                },
              ],
              details: progressDetails(),
            });
          },
        });
        const taskResult = toTaskResult(task, packet.packetHash, result);
        debugSummary(taskResult, result.reviewerExtensionSetStatus, result.instructionFileUsage);
        taskStates[task.id] = { status: taskResult.status };
        completedCount++;
        const verb = taskResult.status === "completed" ? "complete" : taskResult.status;
        emitUpdate(onUpdate, {
          content: [
            { type: "text", text: `Task ${task.id} ${verb} (${completedCount} of ${totalCount})` },
          ],
          details: progressDetails(),
        });
        return settle(taskResult);
      } catch {
        const taskResult: ReviewTaskResult = {
          status: "failed",
          taskId: task.id,
          mode: task.mode,
          packetHash: packet.packetHash,
          modelId: model.canonicalId,
          requestedThinkingLevel: reviewerThinkingLevel,
          effectiveThinkingLevel,
          failureCode: "unexpected-runner-failure",
          diagnostics: createUnobservedAgentRunDiagnostics(),
        };
        debugSummary(taskResult, "unobserved");
        taskStates[task.id] = { status: "failed" };
        completedCount++;
        emitUpdate(onUpdate, {
          content: [
            { type: "text", text: `Task ${task.id} failed (${completedCount} of ${totalCount})` },
          ],
          details: progressDetails(),
        });
        return settle(taskResult);
      }
    }),
  );
}
