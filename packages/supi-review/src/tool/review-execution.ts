import {
  type AgentRunProviderAuthority,
  createUnobservedAgentRunDiagnostics,
} from "@mrclrchtr/supi-agent-runtime/api";
import { normalizeReviewInput } from "../review-input.ts";
import { normalizeReviewSubmission } from "../review-result.ts";
import { buildReviewPacket } from "../target/packet.ts";
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
} from "../types.ts";
import { recordReviewTaskDebugSummary } from "./review-debug-summary.ts";
import { runReviewer } from "./review-runner.ts";

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
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.capabilityWarnings ? { capabilityWarnings: result.capabilityWarnings } : {}),
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

/** Run all caller-defined tasks concurrently against one already-frozen Review Workspace. */
// biome-ignore lint/complexity/useMaxParams: compact internal fan-out helper
export async function executeReviewTasks(
  workspaceCwd: string,
  snapshot: ReviewSnapshot,
  reviewInput: ReviewInput,
  scope: ReviewScope,
  model: ReviewModelSelection,
  projectTrusted?: boolean,
  signal?: AbortSignal,
  onUpdate?: ReviewExecutionUpdate,
  audit?: ReviewerAuditRequest,
  dependencyBootstrapConfigured = false,
  providerAuthority?: AgentRunProviderAuthority,
): Promise<ReviewTaskResult[]> {
  const review = normalizeReviewInput(reviewInput);
  let completedCount = 0;
  const totalCount = review.tasks.length;
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

  return Promise.all(
    review.tasks.map(async (task) => {
      const packet = buildReviewPacket(snapshot, review, scope, task, model);
      const packetBytes = Buffer.byteLength(packet.prompt, "utf8");
      const startedAt = Date.now();
      const debugSummary = (
        taskResult: ReviewTaskResult,
        reviewerExtensionSetStatus: ReviewerExtensionSetStatus,
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
        });
      };
      taskStates[task.id] = { status: "running" };
      emitUpdate(onUpdate, {
        content: [{ type: "text", text: `Task ${task.id} started` }],
        details: progressDetails(),
      });
      try {
        const result = await runReviewer({
          cwd: workspaceCwd,
          snapshot,
          task,
          prompt: packet.prompt,
          packetHash: packet.packetHash,
          model,
          providerAuthority,
          projectTrusted,
          ...(audit ? { audit } : {}),
          ...(dependencyBootstrapConfigured ? { dependencyBootstrapConfigured } : {}),
          signal,
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
        debugSummary(taskResult, result.reviewerExtensionSetStatus);
        taskStates[task.id] = { status: taskResult.status };
        completedCount++;
        const verb = taskResult.status === "completed" ? "complete" : taskResult.status;
        emitUpdate(onUpdate, {
          content: [
            { type: "text", text: `Task ${task.id} ${verb} (${completedCount} of ${totalCount})` },
          ],
          details: progressDetails(),
        });
        return taskResult;
      } catch {
        const taskResult: ReviewTaskResult = {
          status: "failed",
          taskId: task.id,
          mode: task.mode,
          packetHash: packet.packetHash,
          modelId: model.canonicalId,
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
        return taskResult;
      }
    }),
  );
}
