import { clampThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { HEADLESS_INSPECTION_TOOL_NAMES } from "@mrclrchtr/supi-code-intelligence/headless";
import { ReviewAuditTraceCollector } from "../audit/review-audit.ts";
import { summarizeReviewSnapshot } from "../git.ts";
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
  const protocolPrompt = buildReviewerSystemPrompt(invocation.dependencyBootstrapConfigured);
  const thinkingLevel = clampThinkingLevel(invocation.model.model, "max");
  const withWarnings = () => (warnings.length > 0 ? { capabilityWarnings: warnings } : {});
  let session: AgentSession | undefined;
  let trace: ReviewAuditTraceCollector | undefined;
  let unsubscribe: (() => void) | undefined;

  const result = await runIsolatedChild<ReviewSubmission, ReviewerRunResult>({
    cwd: invocation.cwd,
    protocolPrompt,
    model: invocation.model.model,
    thinkingLevel,
    timeoutMs: undefined,
    prompt: invocation.prompt,
    signal: invocation.signal,
    tools: ["read", "bash", ...HEADLESS_INSPECTION_TOOL_NAMES, submit.name],
    customTools: [submit],
    holder,
    headlessInspection: true,
    projectTrusted: invocation.projectTrusted ?? false,
    onSessionCreated: (created) => {
      session = created;
      if (invocation.audit) {
        trace = new ReviewAuditTraceCollector();
        unsubscribe = created.subscribe((event) => trace?.observe(event));
      }
      const active = new Set(created.getActiveToolNames());
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
  unsubscribe?.();
  if (!invocation.audit || !session || !trace) return result;

  try {
    const replay = trace.snapshot(session, result.usage);
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
