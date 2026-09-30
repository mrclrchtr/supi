import { realpath } from "node:fs/promises";
import type {
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ConsultingAgentAdapter, ConsultingAgentAvailability } from "../../agents/types.ts";
import {
  appendHandleCreated,
  appendHandleRetired,
  type ConversationHandleStore,
} from "../../conversation/handles.ts";
import { type ConsultingRunInput, parseConsultingRunInput } from "./input.ts";
import { buildConsultationResult } from "./result.ts";

/** Dependencies captured by one dynamically registered consulting_run tool. */
export interface ConsultingRunDependencies {
  pi: ExtensionAPI;
  adapter: ConsultingAgentAdapter;
  availability: ConsultingAgentAvailability;
  handles: ConversationHandleStore;
}

type ConsultingExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the execute function for one immutable agent availability snapshot. */
export function makeConsultingRunExecute(
  dependencies: ConsultingRunDependencies,
): ConsultingExecute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute contract requires five parameters.
  return async (_toolCallId, params, signal, onUpdate, ctx) => {
    const input = parseConsultingRunInput(
      params,
      dependencies.availability.agent,
      dependencies.availability.catalogue,
    );
    const startedAt = Date.now();
    if (input.new) {
      return runNew({ input, dependencies, signal, onUpdate, ctx, startedAt });
    }
    if (!input.continue) throw new Error("consulting_run requires exactly one of new or continue.");
    return runContinue({
      continuation: input.continue,
      prompt: input.prompt,
      dependencies,
      signal,
      onUpdate,
      ctx,
      startedAt,
    });
  };
}

interface CommonRunOptions {
  dependencies: ConsultingRunDependencies;
  signal: AbortSignal | undefined;
  onUpdate: AgentToolUpdateCallback<unknown> | undefined;
  ctx: ExtensionContext;
  startedAt: number;
}

interface NewRunOptions extends CommonRunOptions {
  input: Extract<ConsultingRunInput, { new: object }>;
}

async function runNew(options: NewRunOptions): Promise<ReturnType<typeof buildConsultationResult>> {
  const { input, dependencies, signal, onUpdate, ctx, startedAt } = options;
  const workspaceAccess = input.new.workspace;
  const cwd = await resolveWorkingDirectory(
    workspaceAccess,
    ctx.cwd,
    dependencies.adapter.consultationWorkspace,
  );
  const progress = createProgressReporter(
    onUpdate,
    dependencies.adapter.identity,
    input.new.model,
    workspaceAccess,
  );
  progress("starting Consultation");
  let hookWarning: string | undefined;
  const facts = await dependencies.adapter.execute({
    prompt: input.prompt,
    model: input.new.model,
    canonicalWorkingDirectory: cwd,
    workspaceAccess,
    signal,
    onProgress: progress,
    onWarning: (warning) => {
      hookWarning = warning;
      notifyWarning(ctx, warning);
    },
  });
  const record = dependencies.handles.create({
    agent: dependencies.adapter.identity,
    model: input.new.model,
    continuation: facts.continuation,
    canonicalWorkingDirectory: cwd,
    workspaceAccess,
    agentVersion: dependencies.availability.agentVersion,
  });
  appendHandleCreated(dependencies.pi, record);
  return buildConsultationResult({
    facts,
    handle: record,
    durationMs: Date.now() - startedAt,
    ...(hookWarning ? { hookWarning } : {}),
  });
}

interface ContinueRunOptions extends CommonRunOptions {
  continuation: Extract<ConsultingRunInput, { continue: object }>["continue"];
  prompt: string;
}

async function runContinue(
  options: ContinueRunOptions,
): Promise<ReturnType<typeof buildConsultationResult>> {
  const { continuation, prompt, dependencies, signal, onUpdate, ctx, startedAt } = options;
  const record = dependencies.handles.acquire(continuation.handle, dependencies.adapter.identity);
  let processStarted = false;
  try {
    if (!dependencies.availability.catalogue.includes(record.model)) {
      throw new Error("The Conversation Handle model is not available in the current catalogue.");
    }
    const progress = createProgressReporter(
      onUpdate,
      record.agent,
      record.model,
      record.workspaceAccess,
    );
    progress("starting Consultation follow-up");
    let hookWarning: string | undefined;
    const facts = await dependencies.adapter.execute({
      prompt,
      model: record.model,
      canonicalWorkingDirectory: record.canonicalWorkingDirectory,
      workspaceAccess: record.workspaceAccess,
      continuation: record.continuation,
      signal,
      onProgress: progress,
      onWarning: (warning) => {
        hookWarning = warning;
        notifyWarning(ctx, warning);
      },
      onProcessStart: () => {
        processStarted = true;
      },
    });
    return buildConsultationResult({
      facts,
      handle: record,
      durationMs: Date.now() - startedAt,
      ...(hookWarning ? { hookWarning } : {}),
    });
  } catch (error) {
    if (processStarted) {
      const retired = dependencies.handles.retire(record.handle);
      if (retired) appendHandleRetired(dependencies.pi, retired, "Consultation follow-up failed");
    }
    throw error;
  } finally {
    dependencies.handles.release(record.handle);
  }
}

async function resolveWorkingDirectory(
  workspaceAccess: boolean,
  currentDirectory: string,
  consultationWorkspace: string,
): Promise<string> {
  return realpath(workspaceAccess ? currentDirectory : consultationWorkspace);
}

function createProgressReporter(
  onUpdate: AgentToolUpdateCallback<unknown> | undefined,
  agent: string,
  model: string,
  workspaceAccess: boolean,
): (activity: string) => void {
  return (activity: string) => {
    onUpdate?.({
      content: [{ type: "text", text: "Consulting is working…" }],
      details: {
        agent,
        model,
        workingDirectoryKind: workspaceAccess ? "workspace" : "consultation",
        workspaceAccess,
        latestActivity: activity,
      },
    });
  };
}

function notifyWarning(ctx: ExtensionContext, warning: string): void {
  try {
    ctx.ui.notify(warning, "warning");
  } catch {
    // A closed UI must not change Consultation execution or handle state.
  }
}
