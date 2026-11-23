import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ReviewBatchHandle } from "../../background/handle.ts";
import type { PostReviewPolicy } from "../../config.ts";
import type { ReviewArtifactStore } from "../../session/review-artifact-store.ts";
import type {
  ReviewBatchDetails,
  ReviewMode,
  ReviewOutputReference,
  ReviewWorkspaceReceipt,
} from "../../types.ts";
import { createReviewOutput, MAX_PAGE_CHARACTERS, MAX_PAGE_LINES } from "../output-page.ts";
import {
  formatReviewBatch,
  formatWorkspaceReceipt,
  type ReviewBatchFormatOptions,
} from "./format.ts";
import { withPostReviewInstruction } from "./post-policy.ts";
import type { PreparedReview, runReview } from "./workflow.ts";

/** Completed variant of the review_run workflow outcome. */
export type CompletedReviewOutcome = Extract<
  Awaited<ReturnType<typeof runReview>>,
  { kind: "completed" }
>;

export type ReviewRunResultDetails = ReviewBatchDetails & { output: ReviewOutputReference };

const POST_REVIEW_POLICY_CHARACTER_RESERVE = 4_000;
const POST_REVIEW_POLICY_LINE_RESERVE = 32;

/** Store the full batch report and assemble the model-facing review_run result. */
export function buildRunResult(
  artifactStore: ReviewArtifactStore,
  outcome: CompletedReviewOutcome,
  postReviewPolicy: PostReviewPolicy,
  format: ReviewBatchFormatOptions = {},
): AgentToolResult<ReviewRunResultDetails> {
  const hasFindings = outcome.details.results.some(
    (result) => result.status === "completed" && result.findings.length > 0,
  );
  const output = createReviewOutput(
    artifactStore,
    formatReviewBatch(outcome.details, format),
    hasFindings
      ? {
          firstPageCharacters: MAX_PAGE_CHARACTERS - POST_REVIEW_POLICY_CHARACTER_RESERVE,
          firstPageLines: MAX_PAGE_LINES - POST_REVIEW_POLICY_LINE_RESERVE,
        }
      : {},
  );
  const text = withPostReviewInstruction(
    output.text,
    postReviewPolicy,
    outcome.details,
    output.reference,
  );
  return {
    content: [{ type: "text", text }],
    details: { ...outcome.details, output: output.reference },
    ...(outcome.usage ? { usage: outcome.usage } : {}),
  };
}

/** Details of a Background Review start result; the renderer reads them back. */
export interface BackgroundStartDetails {
  mode: "background";
  batchId: string;
  targetTitle?: string;
  tasks?: Array<{ taskId: string; mode: ReviewMode; status: "running" }>;
  workspaceReceipt?: ReviewWorkspaceReceipt;
}

/** Whether review_run result details describe a Background Review start. */
export function isBackgroundStart(details: unknown): details is BackgroundStartDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    (details as { mode?: unknown }).mode === "background" &&
    typeof (details as { batchId?: unknown }).batchId === "string"
  );
}

/** Start result of a Background Review: handle, tasks, and receipt, without findings or Usage. */
export function buildBackgroundStartResult(
  handle: ReviewBatchHandle,
  prepared: PreparedReview,
): AgentToolResult<BackgroundStartDetails> {
  const tasks = handle.tasks.map((task) => ({ ...task, status: "running" as const }));
  const text = [
    `Background Review started: batch ${handle.batchId}.`,
    `Target: ${prepared.snapshot.title}`,
    formatWorkspaceReceipt(prepared.workspace.receipt),
    `Tasks: ${tasks.map((task) => `${task.taskId} (${task.mode}, running)`).join(", ")}`,
    `One Completion Notice follows when every Review Task is terminal. Then collect the report with agent_result ${JSON.stringify({ batchId: handle.batchId })}; do not poll.`,
  ].join("\n");
  return {
    content: [{ type: "text", text }],
    details: {
      mode: "background",
      batchId: handle.batchId,
      targetTitle: prepared.snapshot.title,
      tasks,
      workspaceReceipt: prepared.workspace.receipt,
    },
  };
}
