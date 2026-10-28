import { startDebugTimer } from "@mrclrchtr/supi-core/debug";
import type { ConsultationActivity, ConsultationExecutionFacts } from "../../types.ts";
import { ConsultingAgentError, type ConsultingAgentFailureKind } from "../errors.ts";
import type {
  ConsultingAgentAdapter,
  ConsultingAgentAvailability,
  ConsultingAgentExecutionOptions,
  ConsultingAvailability,
} from "../types.ts";
import { isWebToolName, isWorkspaceToolName } from "./activity.ts";
import { discoverAntigravityAvailability } from "./availability.ts";
import {
  getIsolatedAntigravityPaths,
  type IsolatedAntigravityPaths,
  prepareIsolatedAntigravityHome,
} from "./isolated-home.ts";
import { isCuratedModel } from "./models.ts";
import { probeProjectHooks } from "./process/hooks.ts";
import { AntigravityProcessError, runAntigravityConversation } from "./process/runner.ts";
import { ANTIGRAVITY_ANSWER_SCHEMA } from "./structured-output.ts";

const MAX_RETAINED_REFERENCE_HASHES = 512;
const MAX_WARNING_COUNT = 24;
const MAX_WARNING_CHARS = 500;
const CONTINUATION_PREFIX = "agy1.";

type ExecutionPhase = "preparation" | "hook-probe" | "conversation" | "validation";

/** The one agent supported by Consulting in this package. */
export const ANTIGRAVITY_AGENT_ID = "antigravity" as const;

/** Compose the private Antigravity implementation behind the neutral adapter. */
export function createAntigravityAdapter(
  paths: IsolatedAntigravityPaths = getIsolatedAntigravityPaths(),
): ConsultingAgentAdapter {
  return new AntigravityAdapter(paths);
}

class AntigravityAdapter implements ConsultingAgentAdapter {
  readonly identity = ANTIGRAVITY_AGENT_ID;
  readonly consultationWorkspace: string;
  readonly #paths: IsolatedAntigravityPaths;

  constructor(paths: IsolatedAntigravityPaths) {
    this.#paths = paths;
    this.consultationWorkspace = paths.consultationWorkspace;
  }

  async discover(options: { signal?: AbortSignal } = {}): Promise<ConsultingAvailability> {
    const availability = await discoverAntigravityAvailability({
      paths: this.#paths,
      signal: options.signal,
    });
    if (availability.status === "available") {
      const result: ConsultingAgentAvailability = {
        status: "available",
        agent: this.identity,
        agentVersion: availability.cliVersion,
        catalogue: availability.catalogue,
      };
      return Object.freeze({ ...result, catalogue: Object.freeze([...result.catalogue]) });
    }
    return {
      status: "unavailable",
      reason: availability.reason,
      warning: availability.warning,
      ...(availability.cliVersion ? { agentVersion: availability.cliVersion } : {}),
    };
  }

  async execute(options: ConsultingAgentExecutionOptions): Promise<ConsultationExecutionFacts> {
    const timer = startDebugTimer();
    let phase: ExecutionPhase = "preparation";
    try {
      return await this.#execute(options, (nextPhase) => {
        timer.mark(phase);
        phase = nextPhase;
      });
    } catch (error) {
      const failure = safeExecutionFailure(error);
      const canceled = failure.kind === "cancelled";
      timer.finish(
        () => ({
          source: "consulting",
          level: canceled ? "info" : "error",
          category: canceled ? "consultation.cancelled" : "consultation.failed",
          message: failure.message,
          cwd: options.canonicalWorkingDirectory,
          data: {
            agent: this.identity,
            model: isCuratedModel(options.model) ? options.model : "unknown",
            workspaceAccess: options.workspaceAccess,
            followUp: options.continuation !== undefined,
            phase,
            kind: failure.kind,
            reason: failure.reason ?? failure.kind,
            ...failure.diagnostics,
          },
        }),
        phase,
      );
      throw failure;
    }
  }

  async #execute(
    options: ConsultingAgentExecutionOptions,
    onPhase: (phase: ExecutionPhase) => void,
  ): Promise<ConsultationExecutionFacts> {
    const expectedConversationId = options.continuation
      ? decodeContinuation(options.continuation)
      : undefined;
    await prepareIsolatedAntigravityHome(this.#paths);
    const inspectHooks =
      options.workspaceAccess || (options.additionalReadOnlyDirectories?.length ?? 0) > 0;
    if (inspectHooks) onPhase("hook-probe");
    const hookWarning = inspectHooks
      ? await inspectProjectHooks(this.#paths, options, options.onWarning)
      : undefined;
    onPhase("conversation");
    const rawFacts = await runAntigravityConversation({
      paths: this.#paths,
      cwd: options.canonicalWorkingDirectory,
      prompt: options.prompt,
      model: options.model,
      ...(expectedConversationId ? { conversationId: expectedConversationId } : {}),
      ...(options.workspaceAccess ? { workspaceDirectory: options.canonicalWorkingDirectory } : {}),
      additionalReadOnlyDirectories: options.additionalReadOnlyDirectories,
      schema: ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>,
      signal: options.signal,
      onActivity: options.onProgress,
      onProcessStart: options.onProcessStart,
    });
    onPhase("validation");
    if (expectedConversationId && rawFacts.conversationId !== expectedConversationId) {
      throw new ConsultingAgentError("conversation-mismatch");
    }

    const warnings = hookWarning ? [hookWarning] : [];
    return {
      answer: rawFacts.answer,
      continuation: encodeContinuation(rawFacts.conversationId),
      ...(rawFacts.usage ? { usage: rawFacts.usage } : {}),
      observedActivities: normalizeObservedActivities(rawFacts.observedToolCounts),
      activityCounts: normalizeActivityCounts(rawFacts.observedToolCounts),
      webUsed: rawFacts.successfulToolNames.some(isWebToolName),
      workspaceUsed: rawFacts.successfulToolNames.some(isWorkspaceToolName),
      permissionDenials: rawFacts.permissionDenials,
      observedSourceHashes: rawFacts.observedSourceHashes.slice(0, MAX_RETAINED_REFERENCE_HASHES),
      observedWorkspacePathHashes: rawFacts.observedWorkspacePathHashes.slice(
        0,
        MAX_RETAINED_REFERENCE_HASHES,
      ),
      warnings: boundWarnings(warnings),
    };
  }
}

async function inspectProjectHooks(
  paths: IsolatedAntigravityPaths,
  options: ConsultingAgentExecutionOptions,
  onWarning: ConsultingAgentExecutionOptions["onWarning"],
): Promise<string | undefined> {
  const probe = await probeProjectHooks({
    paths,
    cwd: options.canonicalWorkingDirectory,
    additionalReadOnlyDirectories: options.additionalReadOnlyDirectories,
    signal: options.signal,
    onProcessStart: options.onProcessStart,
  });
  if (!probe.warning) return undefined;
  const warning = boundWarning(probe.warning);
  onWarning?.(warning);
  return warning;
}

function normalizeObservedActivities(counts: Record<string, number>): ConsultationActivity[] {
  const activities = new Set<ConsultationActivity>();
  for (const name of Object.keys(counts)) activities.add(classifyActivity(name));
  return [...activities];
}

function normalizeActivityCounts(
  counts: Record<string, number>,
): Record<ConsultationActivity, number> {
  const result: Record<ConsultationActivity, number> = { web: 0, workspace: 0, other: 0 };
  for (const [name, count] of Object.entries(counts)) {
    result[classifyActivity(name)] += Math.max(0, Math.floor(count));
  }
  return result;
}

function classifyActivity(name: string): ConsultationActivity {
  if (isWebToolName(name)) return "web";
  if (isWorkspaceToolName(name)) return "workspace";
  return "other";
}

function boundWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings.map(boundWarning).filter(Boolean))].slice(0, MAX_WARNING_COUNT);
}

function boundWarning(warning: string): string {
  return warning.replace(/\s+/g, " ").trim().slice(0, MAX_WARNING_CHARS);
}

function encodeContinuation(conversationId: string): string {
  return `${CONTINUATION_PREFIX}${Buffer.from(conversationId, "utf8").toString("base64url")}`;
}

function decodeContinuation(value: string): string {
  if (!value.startsWith(CONTINUATION_PREFIX) || value.length > 1_000) {
    throw new ConsultingAgentError("invalid-continuation");
  }
  const encoded = value.slice(CONTINUATION_PREFIX.length);
  const conversationId = Buffer.from(encoded, "base64url").toString("utf8");
  if (!conversationId || Buffer.from(conversationId, "utf8").toString("base64url") !== encoded) {
    throw new ConsultingAgentError("invalid-continuation");
  }
  return conversationId;
}

/** Keep only fixed reasons and safe facts, including preparation and callback failures. */
function safeExecutionFailure(error: unknown): ConsultingAgentError {
  if (error instanceof ConsultingAgentError) {
    return new ConsultingAgentError(error.kind, {
      reason: error.reason,
      diagnostics: error.diagnostics,
    });
  }
  const processKinds: Record<AntigravityProcessError["kind"], ConsultingAgentFailureKind> = {
    missing: "unavailable",
    timeout: "timeout",
    cancelled: "cancelled",
    stream: "invalid-response",
    protocol: "invalid-response",
    process: "execution",
  };
  if (!(error instanceof AntigravityProcessError)) return new ConsultingAgentError("execution");
  return new ConsultingAgentError(processKinds[error.kind], {
    reason: error.reason,
    diagnostics: { ...error.diagnostics, exitCode: error.exitCode },
  });
}
