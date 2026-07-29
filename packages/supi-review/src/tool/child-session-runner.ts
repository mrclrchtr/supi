import type { clampThinkingLevel, Model, Usage } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  type AgentSessionRuntime,
  createAgentSession,
  createAgentSessionRuntime,
  getAgentDir,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ChildFailureDiagnostics, ReviewProgress } from "../types.ts";
import { createIsolatedChildResources } from "./child-resource-loader.ts";
import { buildProgressTokens } from "./runner-helpers.ts";
import { runWithLifecycle } from "./session-lifecycle.ts";

const CHILD_RUNTIME_SHUTDOWN_GRACE_MS = 2_000;

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
  headlessInspection?: boolean;
  projectTrusted?: boolean;
  onSessionCreated?: (session: AgentSession) => void;
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

async function disposeRuntime(runtime: AgentSessionRuntime): Promise<void> {
  await Promise.race([
    runtime.dispose().catch(() => undefined),
    new Promise<void>((resolveGrace) => {
      const timeout = setTimeout(resolveGrace, CHILD_RUNTIME_SHUTDOWN_GRACE_MS);
      timeout.unref?.();
    }),
  ]);
}

/**
 * Shared orchestration for isolated child sessions: resource loading,
 * AgentSession runtime lifecycle, and lifecycle wiring so Planner and reviewer
 * runners share one pattern rather than duplicating it.
 */
export async function runIsolatedChild<THolder, TResult>(
  config: IsolatedRunConfig<THolder, TResult>,
): Promise<TResult> {
  const agentDir = process.env.PI_CODING_AGENT_DIR || getAgentDir();
  const { loader, settingsManager } = createIsolatedChildResources(
    config.cwd,
    config.protocolPrompt,
    agentDir,
    {
      headlessInspection: config.headlessInspection,
      projectTrusted: config.projectTrusted,
    },
  );
  let runtime: AgentSessionRuntime | undefined;
  let runtimeDisposal: Promise<void> | undefined;
  try {
    await loader.reload();
    runtime = await createAgentSessionRuntime(
      async ({ cwd, sessionManager, sessionStartEvent }) => {
        const result = await createAgentSession({
          cwd,
          agentDir,
          model: config.model,
          thinkingLevel: config.thinkingLevel,
          tools: config.tools,
          customTools: config.customTools,
          resourceLoader: loader,
          settingsManager,
          sessionManager,
          sessionStartEvent,
        });
        return {
          ...result,
          services: {
            cwd,
            agentDir,
            modelRuntime: result.session.modelRuntime,
            settingsManager,
            resourceLoader: loader,
            diagnostics: [],
          },
          diagnostics: [],
        };
      },
      { cwd: config.cwd, agentDir, sessionManager: SessionManager.inMemory(config.cwd) },
    );
    const activeRuntime = runtime;
    await activeRuntime.session.bindExtensions({ mode: "print" });
    config.onSessionCreated?.(activeRuntime.session);
    return await runWithLifecycle({
      session: activeRuntime.session,
      dispose: () => {
        runtimeDisposal ??= disposeRuntime(activeRuntime);
      },
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
  } finally {
    if (runtime) {
      runtimeDisposal ??= disposeRuntime(runtime);
      await runtimeDisposal;
    }
  }
}
