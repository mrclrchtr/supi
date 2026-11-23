import type { Usage } from "@earendil-works/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionContext,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  type ControlledSdk,
  backgroundHarness as sharedBackgroundHarness,
} from "@mrclrchtr/supi-test-utils/background";
import type {
  AgentRunStatus,
  AgentSessionInputs,
  CompletionNoticeGranularity,
  RunBatchHandle,
  RunBatchOwner,
  RunBatchStartControl,
} from "../../src/api.ts";
import * as runtimeApi from "../../src/api.ts";

/** Custom message type of the artificial owner's Completion Notices. */
export const TEST_NOTICE_TYPE = "test-owner-notice";

/** The runtime entry point; a test can pass a separately loaded copy to emulate bundling. */
export type RuntimeApi = typeof runtimeApi;

interface TestTask {
  readonly taskId: string;
  readonly status: AgentRunStatus;
  readonly usage?: Usage;
  readonly text?: string;
}

/** Handle of the artificial owner's batches. */
export type TestHandle = RunBatchHandle<TestTask>;

/** Inputs of {@link createTestOwner}. */
export interface TestOwnerOptions {
  /** Prefix of every collected and canceled result, and of the rendered result. */
  readonly label: string;
  /** Name of the start tool. */
  readonly startTool: string;
  readonly noticeType: string;
  readonly noticeGranularity?: CompletionNoticeGranularity;
  /** Whether this owner needs the collection tools; omitted means it states no preference. */
  readonly toolsNeeded?: () => boolean;
  /** Receives the owner access after each registration. */
  readonly onOwner?: (owner: RunBatchOwner<TestHandle>) => void;
}

/**
 * A small owner package without profiles, conversations, or checkpoints. Its start tool launches a
 * Background Run Batch of one Agent Run per task ID; the runtime-owned `agent_result` and
 * `agent_cancel` collect and cancel it in this owner's result format.
 */
export function createTestOwner(
  api: RuntimeApi,
  options: TestOwnerOptions,
): (pi: ExtensionAPI) => void {
  const { label } = options;
  return (pi) => {
    let owner: RunBatchOwner<TestHandle> | undefined;
    const current = () => {
      if (!owner) throw new Error("Session not started.");
      return owner;
    };
    api.getAgentRunRegistry(pi);
    pi.on("session_start", () => {
      owner = api.registerRunBatchOwner<TestHandle>(pi, {
        source: "test-owner",
        noticeType: options.noticeType,
        noticeGranularity: options.noticeGranularity,
        buildNotice: (batchId, tasks) => ({
          content: `${label} batch ${batchId}: ${tasks.map((task) => `${task.taskId} ${task.status}`).join(", ")}.`,
          details: { batchId, taskIds: tasks.map((task) => task.taskId) },
        }),
        collection: {
          collect: (_callId, batch) => {
            const tasks = batch.handle.snapshot().results;
            return {
              content: [
                {
                  type: "text",
                  text: `${label}:\n${tasks.map((task) => `${task.taskId}: ${task.status} ${task.text ?? ""}`).join("\n")}`,
                },
              ],
              details: {
                batchId: batch.handle.batchId,
                tasks: tasks.map(({ taskId, status }) => ({ taskId, status })),
              },
            };
          },
          cancel: (batch, { requested }) => ({
            content: [
              {
                type: "text",
                text: `${label}: ${requested ? "stop requested" : "nothing active"}`,
              },
            ],
            details: { batchId: batch.handle.batchId, requested },
          }),
          renderResult: () => new Text(`${label} result`, 0, 0),
          renderCancel: () => new Text(`${label} cancel`, 0, 0),
          canceledMessages: { wait: `${label} wait canceled.` },
          ...(options.toolsNeeded ? { toolsNeeded: options.toolsNeeded } : {}),
        },
      });
      options.onOwner?.(owner);
    });
    pi.registerTool({
      name: options.startTool,
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
          begin: (control) => ({
            result: Promise.resolve(startTestBatch(api, pi, ctx, tasks, control)),
          }),
        });
        return {
          content: [{ type: "text", text: `Started ${batch.handle.batchId}.` }],
          details: { batchId: batch.handle.batchId },
        };
      },
    });
  };
}

/** The default artificial owner: `test_run` starts a per-task batch. */
export const testOwnerExtension = createTestOwner(runtimeApi, {
  label: "test",
  startTool: "test_run",
  noticeType: TEST_NOTICE_TYPE,
});

// biome-ignore lint/complexity/useMaxParams: test fixture mirrors an owner's start inputs.
function startTestBatch(
  api: RuntimeApi,
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  taskIds: readonly string[],
  control: RunBatchStartControl,
): TestHandle {
  const batchId = crypto.randomUUID();
  const registry = api.getAgentRunRegistry(pi);
  const results = new Map<string, TestTask>();
  const runs = taskIds.map((taskId) => {
    const handle = api.startRegisteredAgentRun<string>({
      inputs: testInputs(api, ctx),
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

function testInputs(api: RuntimeApi, ctx: ExtensionContext): AgentSessionInputs {
  return {
    cwd: ctx.cwd,
    model: ctx.model as AgentSessionInputs["model"],
    providerAuthority: api.createAgentRunProviderAuthority(ctx.modelRegistry),
    thinkingLevel: "off",
    tools: [],
    resourceLoader: { reload: async () => undefined } as never,
    settingsManager: SettingsManager.inMemory(),
  };
}

/** The shared background harness loaded with the artificial owner, or with several owners. */
export async function ownerHarness(
  sdk: ControlledSdk,
  extension: (pi: ExtensionAPI) => void = testOwnerExtension,
) {
  const harness = await sharedBackgroundHarness({
    sdk,
    extension,
    childPrompt: (taskId) => `Task ${taskId}`,
  });
  return Object.defineProperty(harness, "registry", {
    get: () => runtimeApi.getAgentRunRegistry(harness.pi as unknown as ExtensionAPI),
  }) as typeof harness & {
    readonly registry: ReturnType<typeof runtimeApi.getAgentRunRegistry>;
  };
}
