import type { clampThinkingLevel, Model } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  type AgentRunContinuation,
  type AgentRunOutcome,
  type AgentRunProgress,
  type AgentRunProviderAuthority,
  type AgentRunSessionView,
  startAgentRun,
} from "@mrclrchtr/supi-agent-runtime/api";
import type { ChildRunOutcome, ReviewProgress } from "../../types.ts";
import { createIsolatedChildResources } from "./child-resources.ts";

/** Configuration for one review adapter over the neutral Agent Run runtime. */
export interface IsolatedRunConfig<T> {
  cwd: string;
  providerAuthority?: AgentRunProviderAuthority;
  protocolPrompt: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  model: Model<any>;
  thinkingLevel: ReturnType<typeof clampThinkingLevel>;
  timeoutMs?: number;
  prompt: string;
  signal?: AbortSignal;
  tools: string[];
  initialActiveTools?: string[];
  customTools: ToolDefinition[];
  holder: { value?: T };
  /** Optional package-owned terminal state kept outside the neutral runtime. */
  declineHolder?: {
    choice?: "submitted" | "declined" | "conflict";
    reason?: string;
  };
  continuation?: AgentRunContinuation;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  authorizedContinuationModels?: readonly Model<any>[];
  headlessInspection?: boolean;
  projectTrusted?: boolean;
  onSessionCreated?: (session: AgentRunSessionView) => undefined | (() => void);
  onProgress?: (progress: ReviewProgress) => void;
}

/** Convert the runtime's complete Usage snapshot to review's compact progress shape. */
function toReviewProgress(progress: AgentRunProgress): ReviewProgress {
  const usage = progress.usage;
  return {
    turns: progress.turns,
    toolUses: progress.toolUses,
    toolErrors: progress.toolErrors,
    ...(usage
      ? {
          tokens: {
            input: usage.input,
            output: usage.output,
            ...(usage.reasoning === undefined ? {} : { reasoning: usage.reasoning }),
            total: usage.totalTokens,
            cacheRead: usage.cacheRead,
            cacheWrite: usage.cacheWrite,
          },
        }
      : {}),
  };
}

/** Map neutral Agent Run failures back to review's stable ChildRunOutcome vocabulary. */
function mapOutcome<T>(outcome: AgentRunOutcome<T>): ChildRunOutcome<T> {
  if (outcome.kind === "success") return outcome;
  if (outcome.kind === "canceled" || outcome.kind === "timeout") return outcome;
  if (outcome.failureCode === "session-creation-failed") return outcome;
  if (outcome.failureCode === "missing-completion") {
    return { ...outcome, failureCode: "missing-structured-output" };
  }
  if (outcome.failureCode === "session-not-ready") {
    return {
      kind: "failed",
      failureCode: "session-creation-failed",
      ...(outcome.usage ? { usage: outcome.usage } : {}),
    };
  }
  if (
    outcome.failureCode === "prompt-rejected" ||
    outcome.failureCode === "unexpected-runner-failure"
  ) {
    return {
      kind: "failed",
      failureCode: outcome.failureCode,
      diagnostics: outcome.diagnostics,
      ...(outcome.usage ? { usage: outcome.usage } : {}),
    };
  }
  return {
    kind: "failed",
    failureCode: "missing-structured-output",
    diagnostics: outcome.diagnostics,
    ...(outcome.usage ? { usage: outcome.usage } : {}),
  };
}

/** Run one review child through the shared Agent Run lifecycle. */
export async function runIsolatedChild<T>(
  config: IsolatedRunConfig<T>,
): Promise<ChildRunOutcome<T>> {
  if (!config.providerAuthority) {
    return { kind: "failed", failureCode: "session-creation-failed" };
  }
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
  const run = startAgentRun<T>({
    inputs: {
      cwd: config.cwd,
      model: config.model,
      providerAuthority: config.providerAuthority,
      thinkingLevel: config.thinkingLevel,
      tools: [...config.tools],
      ...(config.initialActiveTools ? { initialActiveTools: [...config.initialActiveTools] } : {}),
      customTools: [...config.customTools],
      ...(config.authorizedContinuationModels
        ? { authorizedContinuationModels: [...config.authorizedContinuationModels] }
        : {}),
      resourceLoader: loader,
      settingsManager,
      agentDir,
    },
    prompt: config.prompt,
    timeoutMs: config.timeoutMs,
    signal: config.signal,
    completionResolver: (_session) =>
      config.declineHolder?.choice === "declined" || config.declineHolder?.choice === "conflict"
        ? undefined
        : config.holder.value,
    ...(config.continuation ? { continuation: config.continuation } : {}),
    observer: (session) => {
      const cleanup = config.onSessionCreated?.(session);
      return typeof cleanup === "function" ? cleanup : undefined;
    },
  });
  const unsubscribe = config.onProgress
    ? run.subscribe((progress) => {
        if (
          progress.status !== "running" ||
          (progress.turns === 0 && progress.toolUses === 0 && !progress.usage)
        ) {
          return;
        }
        config.onProgress?.(toReviewProgress(progress));
      })
    : undefined;
  try {
    return mapOutcome(await run.result);
  } finally {
    unsubscribe?.();
  }
}
