import { normalizeReviewInput } from "../review-input.ts";
import { normalizeReviewSubmission } from "../review-result.ts";
import { buildReviewPacket } from "../target/packet.ts";
import type {
  ReviewInput,
  ReviewModelSelection,
  ReviewSnapshot,
  ReviewTaskResult,
} from "../types.ts";
import { createUnobservedChildFailureDiagnostics } from "./child-failure-diagnostics.ts";
import { runReviewer } from "./review-runner.ts";

/** Progress callback shared by batch workflow adapters. */
export type ReviewExecutionUpdate = (result: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

function toTaskResult(
  taskId: string,
  packetHash: string,
  result: Awaited<ReturnType<typeof runReviewer>>,
): ReviewTaskResult {
  const identity = {
    taskId,
    packetHash,
    modelId: result.modelId,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.capabilityWarnings ? { capabilityWarnings: result.capabilityWarnings } : {}),
  };
  if (result.kind === "success") {
    const normalized = normalizeReviewSubmission(result.submission);
    return {
      status: "completed",
      ...identity,
      verdict: normalized.verdict,
      summary: normalized.summary,
      findings: normalized.findings,
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
  model: ReviewModelSelection,
  projectTrusted?: boolean,
  signal?: AbortSignal,
  onUpdate?: ReviewExecutionUpdate,
): Promise<ReviewTaskResult[]> {
  const review = normalizeReviewInput(reviewInput);
  let completedCount = 0;
  const totalCount = review.tasks.length;

  return Promise.all(
    review.tasks.map(async (task) => {
      const packet = buildReviewPacket(snapshot, review, task, model);
      try {
        const result = await runReviewer({
          cwd: workspaceCwd,
          snapshot,
          task,
          prompt: packet.prompt,
          model,
          projectTrusted,
          signal,
          onProgress: (progress) =>
            emitUpdate(onUpdate, {
              content: [
                {
                  type: "text",
                  text: `Task ${task.id}: ${progress.turns} turns, ${progress.toolUses} tool uses${progress.tokens ? `, ${progress.tokens.total} tokens` : ""}`,
                },
              ],
              details: { taskId: task.id, progress, completedCount, totalCount },
            }),
        });
        const taskResult = toTaskResult(task.id, packet.packetHash, result);
        completedCount++;
        const verb = taskResult.status === "completed" ? "complete" : taskResult.status;
        emitUpdate(onUpdate, {
          content: [
            { type: "text", text: `Task ${task.id} ${verb} (${completedCount} of ${totalCount})` },
          ],
          details: { completedCount, totalCount },
        });
        return taskResult;
      } catch {
        const taskResult: ReviewTaskResult = {
          status: "failed",
          taskId: task.id,
          packetHash: packet.packetHash,
          modelId: model.canonicalId,
          failureCode: "unexpected-runner-failure",
          diagnostics: createUnobservedChildFailureDiagnostics(),
        };
        completedCount++;
        emitUpdate(onUpdate, {
          content: [
            { type: "text", text: `Task ${task.id} failed (${completedCount} of ${totalCount})` },
          ],
          details: { completedCount, totalCount },
        });
        return taskResult;
      }
    }),
  );
}
