import { realpath } from "node:fs/promises";
import type {
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  appendHandleCreated,
  appendHandleRetired,
  type ConversationHandleStore,
} from "../../conversation/handles.ts";
import {
  type IsolatedAntigravityPaths,
  prepareIsolatedAntigravityHome,
} from "../../isolated-home.ts";
import { probeProjectHooks } from "../../process/hooks.ts";
import { AntigravityProcessError, runAntigravityConversation } from "../../process/runner.ts";
import { ANTIGRAVITY_ANSWER_SCHEMA } from "../../structured-output.ts";
import type { CuratedModel } from "../../types.ts";
import {
  type AntigravityRunInput,
  type ContinueAntigravityInput,
  parseAntigravityRunInput,
} from "./input.ts";
import { buildAntigravityResult } from "./result.ts";

/** Dependencies captured by one dynamically registered Antigravity tool. */
export interface AntigravityRunDependencies {
  pi: ExtensionAPI;
  paths: IsolatedAntigravityPaths;
  catalogue: readonly CuratedModel[];
  cliVersion: string;
  handles: ConversationHandleStore;
}

type AntigravityExecute = NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>;

/** Build the execute function for one immutable availability snapshot. */
export function makeAntigravityRunExecute(
  dependencies: AntigravityRunDependencies,
): AntigravityExecute {
  // biome-ignore lint/complexity/useMaxParams: Pi execute contract requires five parameters.
  return async (_toolCallId, params, signal, onUpdate, ctx) => {
    const input = parseAntigravityRunInput(params, dependencies.catalogue);
    const startedAt = Date.now();
    if (input.new) {
      return runNew({ input, dependencies, signal, onUpdate, ctx, startedAt });
    }
    if (!input.continue)
      throw new Error("antigravity_run requires exactly one of new or continue.");
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
  dependencies: AntigravityRunDependencies;
  signal: AbortSignal | undefined;
  onUpdate: AgentToolUpdateCallback<unknown> | undefined;
  ctx: ExtensionContext;
  startedAt: number;
}

interface NewRunOptions extends CommonRunOptions {
  input: Extract<AntigravityRunInput, { new: object }>;
}

async function runNew(options: NewRunOptions): Promise<ReturnType<typeof buildAntigravityResult>> {
  const { input, dependencies, signal, onUpdate, ctx, startedAt } = options;
  const workspaceAccess = input.new.workspace;
  await prepareIsolatedAntigravityHome(dependencies.paths);
  const cwd = await resolveWorkingDirectory(workspaceAccess, ctx.cwd, dependencies.paths);
  const hookWarning = await prepareWorkspaceRun({
    workspaceAccess,
    cwd,
    paths: dependencies.paths,
    signal,
    ctx,
  });
  const progress = createProgressReporter(onUpdate, input.new.model, workspaceAccess);
  progress("starting Antigravity");

  const facts = await runAntigravityConversation({
    paths: dependencies.paths,
    cwd,
    prompt: input.prompt,
    model: input.new.model,
    workspaceDirectory: workspaceAccess ? cwd : undefined,
    schema: ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>,
    signal,
    onActivity: progress,
  });
  const record = dependencies.handles.create({
    rawAntigravityId: facts.conversationId,
    model: input.new.model,
    canonicalWorkingDirectory: cwd,
    workspaceAccess,
    cliVersion: dependencies.cliVersion,
  });
  appendHandleCreated(dependencies.pi, record);
  return buildAntigravityResult({
    facts,
    handle: record,
    durationMs: Date.now() - startedAt,
    ...(hookWarning ? { hookWarning } : {}),
  });
}

interface ContinueRunOptions extends CommonRunOptions {
  continuation: ContinueAntigravityInput;
  prompt: string;
}

async function runContinue(
  options: ContinueRunOptions,
): Promise<ReturnType<typeof buildAntigravityResult>> {
  const { continuation, prompt, dependencies, signal, onUpdate, ctx, startedAt } = options;
  const record = dependencies.handles.acquire(continuation.handle);
  let processStarted = false;
  try {
    const cwd = record.canonicalWorkingDirectory;
    const hookWarning = await prepareWorkspaceRun({
      workspaceAccess: record.workspaceAccess,
      cwd,
      paths: dependencies.paths,
      signal,
      ctx,
      onProcessStart: () => {
        processStarted = true;
      },
    });
    const progress = createProgressReporter(onUpdate, record.model, record.workspaceAccess);
    await prepareIsolatedAntigravityHome(dependencies.paths);
    progress("starting Antigravity follow-up");
    const facts = await runAntigravityConversation({
      paths: dependencies.paths,
      cwd,
      prompt,
      model: record.model,
      conversationId: record.rawAntigravityId,
      workspaceDirectory: record.workspaceAccess ? cwd : undefined,
      schema: ANTIGRAVITY_ANSWER_SCHEMA as Record<string, unknown>,
      signal,
      onActivity: progress,
      onProcessStart: () => {
        processStarted = true;
      },
    });
    if (facts.conversationId !== record.rawAntigravityId) {
      throw new Error("Antigravity returned a different conversation for this handle.");
    }
    return buildAntigravityResult({
      facts,
      handle: record,
      durationMs: Date.now() - startedAt,
      ...(hookWarning ? { hookWarning } : {}),
    });
  } catch (error) {
    if (processStarted) {
      const retired = dependencies.handles.retire(record.handle);
      if (retired) appendHandleRetired(dependencies.pi, retired, errorMessage(error));
    }
    throw error;
  } finally {
    dependencies.handles.release(record.handle);
  }
}

async function resolveWorkingDirectory(
  workspaceAccess: boolean,
  currentDirectory: string,
  paths: IsolatedAntigravityPaths,
): Promise<string> {
  return realpath(workspaceAccess ? currentDirectory : paths.consultationWorkspace);
}

async function prepareWorkspaceRun(options: {
  workspaceAccess: boolean;
  cwd: string;
  paths: IsolatedAntigravityPaths;
  signal: AbortSignal | undefined;
  ctx: ExtensionContext;
  onProcessStart?: () => void;
}): Promise<string | undefined> {
  if (!options.workspaceAccess) return undefined;
  const hookProbe = await probeProjectHooks({
    paths: options.paths,
    cwd: options.cwd,
    signal: options.signal,
    onProcessStart: options.onProcessStart,
  });
  if (!hookProbe.warning) return undefined;
  options.ctx.ui.notify(hookProbe.warning, "warning");
  return hookProbe.warning;
}

function createProgressReporter(
  onUpdate: AgentToolUpdateCallback<unknown> | undefined,
  model: CuratedModel,
  workspaceAccess: boolean,
): (activity: string) => void {
  return (activity: string) => {
    onUpdate?.({
      content: [{ type: "text", text: "Antigravity is working…" }],
      details: {
        model,
        workingDirectoryKind: workspaceAccess ? "workspace" : "consultation",
        workspaceAccess,
        latestActivity: activity,
      },
    });
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof AntigravityProcessError) return `Antigravity ${error.kind} failure`;
  return "Antigravity follow-up failed";
}
