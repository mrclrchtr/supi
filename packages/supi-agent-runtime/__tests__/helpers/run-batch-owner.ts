import type { Usage } from "@earendil-works/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionContext,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  type ControlledSdk,
  backgroundHarness as sharedBackgroundHarness,
} from "@mrclrchtr/supi-test-utils/background";
import {
  type AgentRunStatus,
  type AgentSessionInputs,
  createAgentRunProviderAuthority,
  getAgentRunRegistry,
  type RunBatchHandle,
  type RunBatchOwner,
  type RunBatchStartControl,
  registerRunBatchOwner,
  startRegisteredAgentRun,
} from "../../src/api.ts";

/** Custom message type of the artificial owner's Completion Notices. */
export const TEST_NOTICE_TYPE = "test-owner-notice";

interface TestTask {
  readonly taskId: string;
  readonly status: AgentRunStatus;
  readonly usage?: Usage;
  readonly text?: string;
}

type TestHandle = RunBatchHandle<TestTask>;

/**
 * A small owner package without profiles, conversations, or checkpoints. `test_run` launches a
 * Background Run Batch of one Agent Run per task ID; `agent_result` collects it with runtime-owned
 * waiting and Usage; `test_cancel` stops it.
 */
export function testOwnerExtension(pi: ExtensionAPI): void {
  let owner: RunBatchOwner<TestHandle> | undefined;
  const current = () => {
    if (!owner) throw new Error("Session not started.");
    return owner;
  };
  getAgentRunRegistry(pi);
  pi.on("session_start", () => {
    owner = registerRunBatchOwner<TestHandle>(pi, {
      source: "test-owner",
      noticeType: TEST_NOTICE_TYPE,
      buildNotice: (batchId, tasks) => ({
        content: `Batch ${batchId}: ${tasks.map((task) => `${task.taskId} ${task.status}`).join(", ")}.`,
        details: { batchId, taskIds: tasks.map((task) => task.taskId) },
      }),
    });
  });
  pi.registerTool({
    name: "test_run",
    label: "Test run",
    description: "Start a test batch.",
    parameters: {} as never,
    // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
    async execute(callId, input, _signal, _onUpdate, ctx) {
      const { tasks } = input as { tasks: string[] };
      const batches = current();
      batches.open(ctx);
      const batch = await batches.start({
        callId,
        mode: "background",
        launchId: batches.findLaunch(callId, ctx),
        data: undefined,
        signal: ctx.signal,
        begin: (control) => ({ result: Promise.resolve(startTestBatch(pi, ctx, tasks, control)) }),
      });
      return {
        content: [{ type: "text", text: `Started ${batch.handle.batchId}.` }],
        details: { batchId: batch.handle.batchId },
      };
    },
  });
  pi.registerTool({
    name: "agent_result",
    label: "Collect",
    description: "Collect a test batch.",
    parameters: {} as never,
    // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
    async execute(callId, input, signal, _onUpdate, ctx) {
      const { batchId, wait } = input as { batchId: string; wait?: boolean };
      const batches = current();
      const batch = batches.get(batchId, ctx);
      if (wait) await batches.wait(batch, signal ?? ctx.signal);
      batches.get(batchId, ctx);
      const tasks = batch.handle.snapshot().results;
      const { usage, usageReceipt } = batches.prepareUsage(callId, batch);
      return {
        content: [
          {
            type: "text",
            text: tasks
              .map((task) => `${task.taskId}: ${task.status} ${task.text ?? ""}`)
              .join("\n"),
          },
        ],
        usage,
        details: {
          batchId,
          tasks: tasks.map(({ taskId, status }) => ({ taskId, status })),
          usageReceipt,
        },
      };
    },
  });
  pi.registerTool({
    name: "test_cancel",
    label: "Cancel",
    description: "Cancel a test batch.",
    parameters: {} as never,
    // biome-ignore lint/complexity/useMaxParams: Pi execute requires five parameters.
    async execute(_callId, input, _signal, _onUpdate, ctx) {
      const batch = current().get((input as { batchId: string }).batchId, ctx);
      void batch.handle.stop();
      return { content: [{ type: "text", text: "Stopping." }], details: {} };
    },
  });
}

function startTestBatch(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  taskIds: readonly string[],
  control: RunBatchStartControl,
): TestHandle {
  const batchId = crypto.randomUUID();
  const registry = getAgentRunRegistry(pi);
  const results = new Map<string, TestTask>();
  const runs = taskIds.map((taskId) => {
    const handle = startRegisteredAgentRun<string>({
      inputs: testInputs(ctx),
      prompt: `Task ${taskId}`,
      completionResolver: (session) => session.getLastAssistantText(),
      // Like a Background Delegation Batch, runs do not observe the parent operation directly.
      registry,
      registration: {
        metadata: {
          batchId,
          taskId,
          kind: "Test Run",
          label: "test",
          cwd: ctx.cwd,
          modelId: "test/model",
          thinkingLevel: "off",
          tools: [],
          startedAt: Date.now(),
        },
      },
    });
    const completion = handle.taskResult.then((outcome) => {
      results.set(taskId, {
        taskId,
        status: outcome.kind === "success" ? "completed" : outcome.kind,
        usage: outcome.usage,
        ...(outcome.kind === "success" ? { text: outcome.value } : {}),
      });
      control.taskSettled(batchId);
    });
    return { taskId, handle, completion };
  });
  return {
    batchId,
    runKeys: new Map(runs.map((run) => [run.taskId, run.handle.runKey])),
    // Like a Delegation Batch, the batch result settles with its task results, before disposal.
    result: Promise.allSettled(runs.map((run) => run.completion)),
    snapshot: () => ({
      results: taskIds.flatMap((taskId) => results.get(taskId) ?? []),
    }),
    stop: () => Promise.allSettled(runs.map((run) => run.handle.stop())).then(() => undefined),
  };
}

function testInputs(ctx: ExtensionContext): AgentSessionInputs {
  return {
    cwd: ctx.cwd,
    model: ctx.model as AgentSessionInputs["model"],
    providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
    thinkingLevel: "off",
    tools: [],
    resourceLoader: { reload: async () => undefined } as never,
    settingsManager: SettingsManager.inMemory(),
  };
}

/** The shared background harness loaded with the artificial owner. */
export async function ownerHarness(sdk: ControlledSdk) {
  const harness = await sharedBackgroundHarness({
    sdk,
    extension: testOwnerExtension,
    childPrompt: (taskId) => `Task ${taskId}`,
  });
  return Object.defineProperty(harness, "registry", {
    get: () => getAgentRunRegistry(harness.pi as unknown as ExtensionAPI),
  }) as typeof harness & { readonly registry: ReturnType<typeof getAgentRunRegistry> };
}
