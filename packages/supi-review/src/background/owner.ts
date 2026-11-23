import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box } from "@earendil-works/pi-tui";
import { type RunBatchOwner, registerRunBatchOwner } from "@mrclrchtr/supi-agent-runtime/api";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import type { ReviewBatchHandle } from "./handle.ts";
import { renderReviewCollection, renderReviewText } from "./render.ts";
import {
  buildReviewCompletionNotice,
  cancelReviewBatch,
  collectReviewBatch,
  REVIEW_COMPLETION_MESSAGE_TYPE,
  type ReviewBatchData,
  reviewBatchProgress,
  reviewNeedsCollection,
} from "./result.ts";

/** Review's access to the Background Run Batches of the containing session. */
export type ReviewBatchOwner = RunBatchOwner<ReviewBatchHandle, ReviewBatchData>;

/**
 * Register Review as a Background Run Batch owner on every `session_start` and return the current
 * owner. Review formats collected results; the runtime owns notices, waiting, and Usage receipts
 * (runtime ADR 0014). One Completion Notice is sent per Review, once every task is terminal.
 */
export function registerReviewBatchOwner(
  pi: ExtensionAPI,
  artifactStore: ReviewArtifactStore,
): () => ReviewBatchOwner | undefined {
  let owner: ReviewBatchOwner | undefined;
  pi.on("session_start", () => {
    const current: ReviewBatchOwner = registerRunBatchOwner<ReviewBatchHandle, ReviewBatchData>(
      pi,
      {
        source: "supi-review",
        noticeType: REVIEW_COMPLETION_MESSAGE_TYPE,
        noticeGranularity: "batch",
        buildNotice: buildReviewCompletionNotice,
        collection: {
          collect: (_callId, batch) => collectReviewBatch(artifactStore, batch),
          cancel: (batch, { requested }, ctx) =>
            cancelReviewBatch(
              batch,
              requested,
              reviewNeedsCollection(batch, ctx.sessionManager.getBranch(), (taskId) =>
                current.usageReported(batch, taskId),
              ),
            ),
          progress: reviewBatchProgress,
          renderResult: renderReviewCollection,
          renderCancel: (result, options, theme) => renderReviewText(result, options, theme),
          canceledMessages: {
            wait: "Review wait canceled.",
            collection: "Review collection canceled.",
          },
        },
      },
    );
    owner = current;
  });
  pi.on("session_shutdown", () => {
    owner = undefined;
  });
  pi.registerMessageRenderer(REVIEW_COMPLETION_MESSAGE_TYPE, (message, options, theme) => {
    const box = new Box(options.outputPad, 0, undefined);
    box.addChild(renderReviewText(message, options, theme));
    return box;
  });
  return () => owner;
}
