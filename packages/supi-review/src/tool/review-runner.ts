import { clampThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ReviewerInvocation, ReviewerRunResult, ReviewSubmission } from "../types.ts";
import { createEarlyCancellationDiagnostics } from "./child-failure-diagnostics.ts";
import { createIsolatedChildResources } from "./child-resource-loader.ts";
import { buildReviewerSystemPrompt } from "./review-system-prompt.ts";
import { createReviewTools } from "./review-tools.ts";
import { runWithLifecycle } from "./session-lifecycle.ts";

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
  const { loader, settingsManager } = createIsolatedChildResources(
    invocation.cwd,
    buildReviewerSystemPrompt(),
  );
  try {
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: invocation.cwd,
      model: invocation.model.model,
      thinkingLevel: clampThinkingLevel(invocation.model.model, "max"),
      tools: customTools.map((tool) => tool.name),
      customTools,
      resourceLoader: loader,
      settingsManager,
      sessionManager: SessionManager.inMemory(invocation.cwd),
    });
    return runWithLifecycle({
      session,
      prompt: invocation.prompt,
      signal: invocation.signal,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      onEvent: (event: AgentSessionEvent, ctx) => {
        if (event.type === "turn_end") ctx.progress.turns++;
        if (event.type === "tool_execution_start") ctx.progress.toolUses++;
        invocation.onProgress?.(ctx.progress);
        if (event.type !== "agent_settled") return;
        const result: ReviewerRunResult = holder.value
          ? { kind: "success", submission: holder.value, modelId: invocation.model.canonicalId }
          : {
              kind: "failed",
              failureCode: "missing-structured-output",
              modelId: invocation.model.canonicalId,
              diagnostics: ctx.getFailureDiagnostics(),
            };
        ctx.resolve(ctx.cleanup(result));
      },
      canceledResult: (ctx) => ({
        kind: "canceled",
        modelId: invocation.model.canonicalId,
        diagnostics: ctx.getFailureDiagnostics(),
      }),
      failedResult: (failureCode, ctx) => ({
        kind: "failed",
        failureCode,
        modelId: invocation.model.canonicalId,
        diagnostics: ctx.getFailureDiagnostics(),
      }),
      timeoutResult: (timeoutMs, ctx) => ({
        kind: "timeout",
        timeoutMs,
        modelId: invocation.model.canonicalId,
        diagnostics: ctx.getFailureDiagnostics(),
      }),
    });
  } catch {
    return {
      kind: "failed",
      failureCode: "session-creation-failed",
      modelId: invocation.model.canonicalId,
    };
  }
}
