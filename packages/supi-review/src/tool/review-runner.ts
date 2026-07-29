import { clampThinkingLevel } from "@earendil-works/pi-ai";
import { HEADLESS_INSPECTION_TOOL_NAMES } from "@mrclrchtr/supi-code-intelligence/headless";
import type {
  ReviewerCapabilityWarning,
  ReviewerInvocation,
  ReviewerRunResult,
  ReviewSubmission,
} from "../types.ts";
import { createEarlyCancellationDiagnostics } from "./child-failure-diagnostics.ts";
import { runIsolatedChild } from "./child-session-runner.ts";
import { buildReviewerSystemPrompt } from "./review-system-prompt.ts";
import { createReviewSubmissionTool } from "./review-tools.ts";

/** Run one caller-defined task in an isolated Inspection-only Reviewer Session. */
export async function runReviewer(invocation: ReviewerInvocation): Promise<ReviewerRunResult> {
  if (invocation.signal?.aborted) {
    return {
      kind: "canceled",
      modelId: invocation.model.canonicalId,
      diagnostics: createEarlyCancellationDiagnostics(),
    };
  }
  const holder: { value?: ReviewSubmission } = {};
  const submit = createReviewSubmissionTool(holder);
  const warnings: ReviewerCapabilityWarning[] = [];
  const withWarnings = () => (warnings.length > 0 ? { capabilityWarnings: warnings } : {});

  return runIsolatedChild<ReviewSubmission, ReviewerRunResult>({
    cwd: invocation.cwd,
    protocolPrompt: buildReviewerSystemPrompt(),
    model: invocation.model.model,
    thinkingLevel: clampThinkingLevel(invocation.model.model, "max"),
    timeoutMs: undefined,
    prompt: invocation.prompt,
    signal: invocation.signal,
    tools: ["read", "bash", ...HEADLESS_INSPECTION_TOOL_NAMES, submit.name],
    customTools: [submit],
    holder,
    headlessInspection: true,
    projectTrusted: invocation.projectTrusted ?? false,
    onSessionCreated: (session) => {
      const active = new Set(session.getActiveToolNames());
      if (HEADLESS_INSPECTION_TOOL_NAMES.every((name) => active.has(name))) return;
      warnings.push({
        message:
          "Headless Code Intelligence was unavailable; this reviewer continued with read and bash inspection.",
      });
    },
    successResult: (submission, usage) => ({
      kind: "success",
      submission,
      modelId: invocation.model.canonicalId,
      ...(usage ? { usage } : {}),
      ...withWarnings(),
    }),
    canceledResult: (diagnostics, usage) => ({
      kind: "canceled",
      modelId: invocation.model.canonicalId,
      diagnostics,
      ...(usage ? { usage } : {}),
      ...withWarnings(),
    }),
    failedResult: (failureCode, diagnostics, usage) => ({
      kind: "failed",
      failureCode,
      modelId: invocation.model.canonicalId,
      diagnostics,
      ...(usage ? { usage } : {}),
      ...withWarnings(),
    }),
    timeoutResult: (timeoutMs, diagnostics, usage) => ({
      kind: "timeout",
      timeoutMs,
      modelId: invocation.model.canonicalId,
      diagnostics,
      ...(usage ? { usage } : {}),
      ...withWarnings(),
    }),
    sessionFailedResult: {
      kind: "failed",
      failureCode: "session-creation-failed",
      modelId: invocation.model.canonicalId,
    },
    onProgress: invocation.onProgress,
  });
}
