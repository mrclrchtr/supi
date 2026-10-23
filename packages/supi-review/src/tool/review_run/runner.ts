import { randomUUID } from "node:crypto";
import {
  type AgentRunDisplayMetadata,
  type AgentRunSessionView,
  createEarlyCancellationDiagnostics,
} from "@mrclrchtr/supi-agent-runtime/api";
import { HEADLESS_INSPECTION_TOOL_NAMES } from "@mrclrchtr/supi-code-intelligence/headless";
import { ReviewAuditTraceCollector } from "../../audit/review-audit.ts";
import { summarizeReviewSnapshot } from "../../git.ts";
import { clampReviewThinkingLevel, REVIEWER_DEFAULT_THINKING_LEVEL } from "../../thinking.ts";
import type {
  ReviewerCapabilityWarning,
  ReviewerExtensionSetStatus,
  ReviewerInvocation,
  ReviewerRunResult,
  ReviewSubmission,
} from "../../types.ts";
import { runIsolatedChild } from "./child-session.ts";
import { createReviewRecoveryDeclineTool, createReviewSubmissionTool } from "./child-tools.ts";
import { ReviewRecoveryPolicy } from "./recovery.ts";
import { normalizeReviewSubmission } from "./submission.ts";
import { buildReviewerSystemPrompt } from "./system-prompt.ts";

function reviewerRunDisplay(
  invocation: ReviewerInvocation,
  thinkingLevel: AgentRunDisplayMetadata["thinkingLevel"],
  tools: readonly string[],
): AgentRunDisplayMetadata & { readonly runKey: string; readonly batchId: string } {
  return {
    runKey: randomUUID(),
    batchId: invocation.runGroupId ?? randomUUID(),
    taskId: invocation.task.id,
    kind: "Reviewer",
    label: `${invocation.task.mode} review`,
    cwd: invocation.cwd,
    modelId: invocation.model.canonicalId,
    thinkingLevel,
    tools,
    taskDescription: `Inspection-only Review Task in ${invocation.task.mode} mode.`,
    display: { target: invocation.snapshot.title },
    startedAt: Date.now(),
  };
}

function auditOutcome(result: ReviewerRunResult): {
  kind: string;
  failureCode?: string;
  timeoutMs?: number;
} {
  if (result.kind === "failed") return { kind: result.kind, failureCode: result.failureCode };
  if (result.kind === "timeout") return { kind: result.kind, timeoutMs: result.timeoutMs };
  return { kind: result.kind };
}

interface ReviewerSessionObservation {
  reviewerExtensionSetStatus: ReviewerExtensionSetStatus;
  warnings: ReviewerCapabilityWarning[];
  trace?: ReviewAuditTraceCollector;
  capturedReplay?: ReturnType<ReviewAuditTraceCollector["snapshot"]>;
  unsubscribe?: () => void;
}

function observeReviewerSession(
  created: AgentRunSessionView,
  invocation: ReviewerInvocation,
  observation: ReviewerSessionObservation,
): (() => void) | undefined {
  if (invocation.audit) {
    observation.trace = new ReviewAuditTraceCollector();
    observation.unsubscribe = created.subscribe((event) => observation.trace?.observe(event));
  }
  const active = new Set(created.getActiveToolNames());
  const missingCapabilities = [
    ...(HEADLESS_INSPECTION_TOOL_NAMES.every((name) => active.has(name))
      ? []
      : ["Headless Code Intelligence"]),
    ...(invocation.reviewerCodemodeEnabled && !active.has("codemode") ? ["codemode"] : []),
  ];
  if (missingCapabilities.length === 0) {
    observation.reviewerExtensionSetStatus = "active";
  } else {
    observation.reviewerExtensionSetStatus = "degraded";
    observation.warnings.push({
      message: `${missingCapabilities.join(" and ")} unavailable; the Reviewer continued with its other permitted tools.`,
    });
  }
  if (!invocation.audit || !observation.trace) return undefined;
  return () => {
    observation.capturedReplay ??= observation.trace?.snapshot(created);
  };
}

/** Run one caller-defined task in an isolated Inspection-only Reviewer Session. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: review, recovery, and continuous audit stay in one adapter lifecycle.
export async function runReviewer(invocation: ReviewerInvocation): Promise<ReviewerRunResult> {
  const requestedThinkingLevel =
    invocation.requestedThinkingLevel ?? REVIEWER_DEFAULT_THINKING_LEVEL;
  const effectiveThinkingLevel = clampReviewThinkingLevel(
    invocation.model.model,
    requestedThinkingLevel,
  );
  if (invocation.signal?.aborted) {
    return {
      kind: "canceled",
      modelId: invocation.model.canonicalId,
      requestedThinkingLevel,
      effectiveThinkingLevel,
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
  const observation: ReviewerSessionObservation = {
    reviewerExtensionSetStatus: "unobserved",
    warnings: [],
  };
  const protocolPrompt = buildReviewerSystemPrompt(
    invocation.dependencyBootstrapConfigured,
    invocation.reviewerCodemodeEnabled,
  );
  let session: AgentRunSessionView | undefined;
  const recovery = new ReviewRecoveryPolicy({
    originalModel: invocation.model,
    ...(invocation.recoveryModel ? { recoveryModel: invocation.recoveryModel } : {}),
    ...(invocation.recoveryModelId ? { recoveryModelId: invocation.recoveryModelId } : {}),
    submission: holder,
    terminal: recoveryTerminal,
    trace: () => observation.trace,
  });

  const originalTools = [
    "read",
    "bash",
    "grep",
    ...HEADLESS_INSPECTION_TOOL_NAMES,
    submit.name,
    ...(invocation.reviewerCodemodeEnabled ? ["codemode"] : []),
  ];
  const outcome = await runIsolatedChild<ReviewSubmission>({
    cwd: invocation.cwd,
    ...(invocation.providerAuthority ? { providerAuthority: invocation.providerAuthority } : {}),
    ...(invocation.reviewerCodemodeEnabled && invocation.authorizedAuxiliaryModels
      ? { authorizedAuxiliaryModels: invocation.authorizedAuxiliaryModels }
      : {}),
    protocolPrompt,
    model: invocation.model.model,
    thinkingLevel: effectiveThinkingLevel,
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
    ...(invocation.registry ? { registry: invocation.registry } : {}),
    headlessInspection: true,
    codemode: invocation.reviewerCodemodeEnabled ?? false,
    projectTrusted: invocation.projectTrusted ?? false,
    runDisplay: reviewerRunDisplay(invocation, effectiveThinkingLevel, originalTools),
    displayResult: (result) => {
      if (result.kind === "failed") return { failureCode: result.failureCode };
      if (result.kind !== "success") return {};
      const submission = normalizeReviewSubmission(result.value);
      return {
        finalText: submission.summary,
        display: {
          target: invocation.snapshot.title,
          verdict: submission.verdict,
          findingCount: submission.findingCounts.total,
          blockingFindingCount: submission.findingCounts.blocking,
        },
      };
    },
    onSessionCreated: (created) => {
      session = created;
      return observeReviewerSession(created, invocation, observation);
    },
    onProgress: invocation.onProgress,
  });
  observation.unsubscribe?.();
  const submissionRecovery =
    outcome.kind === "canceled" || outcome.kind === "timeout" ? undefined : recovery.result();
  const result: ReviewerRunResult = {
    ...outcome,
    modelId: invocation.model.canonicalId,
    requestedThinkingLevel,
    effectiveThinkingLevel,
    reviewerExtensionSetStatus: observation.reviewerExtensionSetStatus,
    ...(observation.warnings.length > 0 ? { capabilityWarnings: observation.warnings } : {}),
    ...(submissionRecovery ? { submissionRecovery } : {}),
  };
  if (!invocation.audit || !session || !observation.trace) return result;

  try {
    const replay = observation.capturedReplay
      ? {
          ...observation.capturedReplay,
          trace: {
            ...observation.capturedReplay.trace,
            ...(result.usage ? { usage: result.usage } : {}),
          },
        }
      : observation.trace.snapshot(session, result.usage);
    const audit = await invocation.audit.store.create({
      task: invocation.task,
      modelId: invocation.model.canonicalId,
      thinkingLevel: effectiveThinkingLevel,
      requestedThinkingLevel,
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
