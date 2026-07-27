import { clampThinkingLevel } from "@earendil-works/pi-ai";
import type { ReviewerInvocation, ReviewerRunResult, ReviewSubmission } from "../types.ts";
import { createEarlyCancellationDiagnostics } from "./child-failure-diagnostics.ts";
import { runIsolatedChild } from "./child-session-runner.ts";
import { buildReviewerSystemPrompt } from "./review-system-prompt.ts";
import { createReviewTools } from "./review-tools.ts";

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1_000;

/** Run one caller-defined task in an isolated read-only reviewer session. */
export async function runReviewer(invocation: ReviewerInvocation): Promise<ReviewerRunResult> {
  if (invocation.signal?.aborted) {
    return {
      kind: "canceled",
      modelId: invocation.model.canonicalId,
      diagnostics: createEarlyCancellationDiagnostics(),
    };
  }
  const holder: { value?: ReviewSubmission } = {};
  const customTools = createReviewTools(invocation.cwd, invocation.snapshot, holder);
  return runIsolatedChild<ReviewSubmission, ReviewerRunResult>({
    cwd: invocation.cwd,
    protocolPrompt: buildReviewerSystemPrompt(),
    model: invocation.model.model,
    thinkingLevel: clampThinkingLevel(invocation.model.model, "max"),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    prompt: invocation.prompt,
    signal: invocation.signal,
    tools: customTools.map((tool) => tool.name),
    customTools,
    holder,
    successResult: (submission) => ({
      kind: "success",
      submission,
      modelId: invocation.model.canonicalId,
    }),
    canceledResult: (diagnostics) => ({
      kind: "canceled",
      modelId: invocation.model.canonicalId,
      diagnostics,
    }),
    failedResult: (failureCode, diagnostics) => ({
      kind: "failed",
      failureCode,
      modelId: invocation.model.canonicalId,
      diagnostics,
    }),
    timeoutResult: (timeoutMs, diagnostics) => ({
      kind: "timeout",
      timeoutMs,
      modelId: invocation.model.canonicalId,
      diagnostics,
    }),
    sessionFailedResult: {
      kind: "failed",
      failureCode: "session-creation-failed",
      modelId: invocation.model.canonicalId,
    },
    onProgress: invocation.onProgress,
  });
}
