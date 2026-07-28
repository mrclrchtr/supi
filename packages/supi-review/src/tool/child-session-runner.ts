import type { clampThinkingLevel, Model, Usage } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ChildFailureDiagnostics, ReviewProgress } from "../types.ts";
import { createIsolatedChildResources } from "./child-resource-loader.ts";
import { buildProgressTokens } from "./runner-helpers.ts";
import { runWithLifecycle } from "./session-lifecycle.ts";

/** Configuration for one isolated child run — resource loading, session, and lifecycle. */
export interface IsolatedRunConfig<THolder, TResult> {
  cwd: string;
  protocolPrompt: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  model: Model<any>;
  thinkingLevel: ReturnType<typeof clampThinkingLevel>;
  timeoutMs?: number;
  prompt: string;
  signal?: AbortSignal;
  tools: string[];
  customTools: ToolDefinition[];
  holder: { value?: THolder };
  successResult: (value: THolder, usage?: Usage) => TResult;
  canceledResult: (diagnostics: ChildFailureDiagnostics, usage?: Usage) => TResult;
  failedResult: (
    failureCode: "prompt-rejected" | "missing-structured-output" | "unexpected-runner-failure",
    diagnostics: ChildFailureDiagnostics,
    usage?: Usage,
  ) => TResult;
  timeoutResult: (
    timeoutMs: number,
    diagnostics: ChildFailureDiagnostics,
    usage?: Usage,
  ) => TResult;
  sessionFailedResult: TResult;
  onProgress?: (progress: ReviewProgress) => void;
}

/**
 * Shared orchestration for isolated child sessions: resource loading,
 * session creation, and lifecycle wiring so Planner and reviewer runners
 * share one pattern rather than duplicating it.
 */
export async function runIsolatedChild<THolder, TResult>(
  config: IsolatedRunConfig<THolder, TResult>,
): Promise<TResult> {
  const { loader, settingsManager } = createIsolatedChildResources(
    config.cwd,
    config.protocolPrompt,
  );
  try {
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: config.cwd,
      model: config.model,
      thinkingLevel: config.thinkingLevel,
      tools: config.tools,
      customTools: config.customTools,
      resourceLoader: loader,
      settingsManager,
      sessionManager: SessionManager.inMemory(config.cwd),
    });
    return runWithLifecycle({
      session,
      prompt: config.prompt,
      signal: config.signal,
      timeoutMs: config.timeoutMs,
      onEvent: (event, ctx) => {
        const reportsProgress =
          event.type === "turn_end" ||
          event.type === "tool_execution_start" ||
          event.type === "agent_settled";
        if (event.type === "turn_end") ctx.progress.turns++;
        if (event.type === "tool_execution_start") ctx.progress.toolUses++;
        if (reportsProgress) {
          ctx.progress.tokens = buildProgressTokens(() => ctx.session.getSessionStats());
          config.onProgress?.({ ...ctx.progress });
        }
        if (event.type !== "agent_settled") return;
        const result = config.holder.value
          ? config.successResult(config.holder.value, ctx.getUsage())
          : config.failedResult(
              "missing-structured-output",
              ctx.getFailureDiagnostics(),
              ctx.getUsage(),
            );
        ctx.resolve(ctx.cleanup(result));
      },
      canceledResult: (ctx) => config.canceledResult(ctx.getFailureDiagnostics(), ctx.getUsage()),
      failedResult: (failureCode, ctx) =>
        config.failedResult(failureCode, ctx.getFailureDiagnostics(), ctx.getUsage()),
      timeoutResult: (timeoutMs, ctx) =>
        config.timeoutResult(timeoutMs, ctx.getFailureDiagnostics(), ctx.getUsage()),
    });
  } catch {
    return config.sessionFailedResult;
  }
}
