import { clampThinkingLevel } from "@earendil-works/pi-ai";
import {
  type AgentRunSessionView,
  createEarlyCancellationDiagnostics,
} from "@mrclrchtr/supi-agent-runtime/api";
import { HEADLESS_INSPECTION_TOOL_NAMES } from "@mrclrchtr/supi-code-intelligence/headless";
import { ReviewAuditTraceCollector } from "../audit/review-audit.ts";
import { summarizeReviewSnapshot } from "../git.ts";
import type {
  ReviewerCapabilityWarning,
  ReviewerExtensionSetStatus,
  ReviewerInvocation,
  ReviewerRunResult,
  ReviewSubmission,
} from "../types.ts";
import { runIsolatedChild } from "./child-session-runner.ts";
import { ReviewRecoveryPolicy } from "./review-recovery.ts";
import { buildReviewerSystemPrompt } from "./review-system-prompt.ts";
import { createReviewRecoveryDeclineTool, createReviewSubmissionTool } from "./review-tools.ts";

function auditOutcome(result: ReviewerRunResult): {
  kind: string;
  failureCode?: string;
  timeoutMs?: number;
} {
  if (result.kind === "failed") return { kind: result.kind, failureCode: result.failureCode };
  if (result.kind === "timeout") return { kind: result.kind, timeoutMs: result.timeoutMs };
  return { kind: result.kind };
}

/** Run one caller-defined task in an isolated Inspection-only Reviewer Session. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: review, recovery, and continuous audit stay in one adapter lifecycle.
export async function runReviewer(invocation: ReviewerInvocation): Promise<ReviewerRunResult> {
  if (invocation.signal?.aborted) {
    return {
      kind: "canceled",
      modelId: invocation.model.canonicalId,
      reviewerExtensionSetStatus: "unobserved",
      diagnostics: createEarlyCancellationDiagnostics(),
    };
  }
  const holder: { value?: ReviewSubmission } = {};
  const recoveryTerminal: {
    choice?: "submitted" | "declined" | "conflict";
    reason?: string;
  } = {};
  const submit = createReviewSubmissionTool(holder, recoveryTerminal);
  const decline = createReviewRecoveryDeclineTool(recoveryTerminal);
  const warnings: ReviewerCapabilityWarning[] = [];
  const protocolPrompt = buildReviewerSystemPrompt(invocation.dependencyBootstrapConfigured);
  const thinkingLevel = clampThinkingLevel(invocation.model.model, "max");
  let reviewerExtensionSetStatus: ReviewerExtensionSetStatus = "unobserved";
  let session: AgentRunSessionView | undefined;
  let trace: ReviewAuditTraceCollector | undefined;
  let capturedReplay: ReturnType<ReviewAuditTraceCollector["snapshot"]> | undefined;
  let unsubscribe: (() => void) | undefined;
  const recovery = new ReviewRecoveryPolicy({
    originalModel: invocation.model,
    ...(invocation.recoveryModel ? { recoveryModel: invocation.recoveryModel } : {}),
    ...(invocation.recoveryModelId ? { recoveryModelId: invocation.recoveryModelId } : {}),
    submission: holder,
    terminal: recoveryTerminal,
    trace: () => trace,
  });

  const originalTools = ["read", "bash", "grep", ...HEADLESS_INSPECTION_TOOL_NAMES, submit.name];
  const outcome = await runIsolatedChild<ReviewSubmission>({
    cwd: invocation.cwd,
    ...(invocation.providerAuthority ? { providerAuthority: invocation.providerAuthority } : {}),
    protocolPrompt,
    model: invocation.model.model,
    thinkingLevel,
    timeoutMs: undefined,
    prompt: invocation.prompt,
    signal: invocation.signal,
    tools: [...originalTools, decline.name],
    initialActiveTools: originalTools,
    customTools: [submit, decline],
    holder,
    declineHolder: recoveryTerminal,
    continuation: recovery.continuation,
    ...(invocation.recoveryModel
      ? { authorizedContinuationModels: [invocation.recoveryModel.model] }
      : {}),
    headlessInspection: true,
    projectTrusted: invocation.projectTrusted ?? false,
    onSessionCreated: (created) => {
      session = created;
      if (invocation.audit) {
        trace = new ReviewAuditTraceCollector();
        unsubscribe = created.subscribe((event) => trace?.observe(event));
      }
      const active = new Set(created.getActiveToolNames());
      if (HEADLESS_INSPECTION_TOOL_NAMES.every((name) => active.has(name))) {
        reviewerExtensionSetStatus = "active";
      } else {
        reviewerExtensionSetStatus = "degraded";
        warnings.push({
          message:
            "Headless Code Intelligence was unavailable; this reviewer continued with read, bash, and grep inspection.",
        });
      }
      if (!invocation.audit || !trace) return;
      return () => {
        capturedReplay ??= trace?.snapshot(created);
      };
    },
    onProgress: invocation.onProgress,
  });
  unsubscribe?.();
  const submissionRecovery =
    outcome.kind === "canceled" || outcome.kind === "timeout" ? undefined : recovery.result();
  const result: ReviewerRunResult = {
    ...outcome,
    modelId: invocation.model.canonicalId,
    reviewerExtensionSetStatus,
    ...(warnings.length > 0 ? { capabilityWarnings: warnings } : {}),
    ...(submissionRecovery ? { submissionRecovery } : {}),
  };
  if (!invocation.audit || !session || !trace) return result;

  try {
    const replay = capturedReplay
      ? {
          ...capturedReplay,
          trace: {
            ...capturedReplay.trace,
            ...(result.usage ? { usage: result.usage } : {}),
          },
        }
      : trace.snapshot(session, result.usage);
    const audit = await invocation.audit.store.create({
      task: invocation.task,
      modelId: invocation.model.canonicalId,
      thinkingLevel,
      protocolPrompt,
      packet: invocation.prompt,
      packetHash: invocation.packetHash,
      snapshot: summarizeReviewSnapshot(invocation.snapshot),
      workspaceReceipt: invocation.audit.workspaceReceipt,
      outcome: auditOutcome(result),
      ...replay,
    });
    return { ...result, audit };
  } catch {
    return result;
  }
}
