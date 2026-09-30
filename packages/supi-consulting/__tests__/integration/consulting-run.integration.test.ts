import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ConsultingAgentAdapter,
  ConsultingAgentExecutionOptions,
} from "../../src/agents/types.ts";
import {
  CONSULTING_HANDLE_ENTRY_TYPE,
  ConversationHandleStore,
} from "../../src/conversation/handles.ts";
import { ConsultingRuntime } from "../../src/runtime.ts";
import { registerConsultingRunTool } from "../../src/tool/consulting_run/register.ts";

const roots: string[] = [];
const fakeFacts = {
  answer: {
    answer: "A provider-neutral answer.",
    sources: [],
    workspaceEvidence: [],
  },
  continuation: "opaque-continuation",
  observedActivities: [],
  activityCounts: { web: 0, workspace: 0, other: 0 },
  webUsed: false,
  workspaceUsed: false,
  permissionDenials: 0,
  observedSourceHashes: [],
  observedWorkspacePathHashes: [],
  warnings: [],
};

async function setup(): Promise<{
  cwd: string;
  execute: ReturnType<typeof vi.fn>;
  pi: ReturnType<typeof createPiMock>;
}> {
  const root = await mkdtemp(join(tmpdir(), "supi-consulting-workflow-"));
  roots.push(root);
  const cwd = join(root, "repo");
  const consultationWorkspace = join(root, "consultation-workspace");
  await Promise.all([mkdir(cwd), mkdir(consultationWorkspace)]);
  const execute = vi.fn<ConsultingAgentAdapter["execute"]>(
    async (_options: ConsultingAgentExecutionOptions) => fakeFacts,
  );
  const adapter: ConsultingAgentAdapter = {
    identity: "antigravity",
    consultationWorkspace,
    discover: vi.fn(async () => ({
      status: "available" as const,
      agent: "antigravity",
      agentVersion: "fake-agent-4",
      catalogue: Object.freeze(["local-model-v2"]),
    })),
    execute,
  };
  const pi = createPiMock();
  const runtime = new ConsultingRuntime({ pi: pi as never, adapter, homeDir: root });
  const _context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
  await runtime.startRefresh(cwd);
  await vi.waitFor(() => expect(pi.tools).toHaveLength(1));
  return { cwd, execute, pi };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("consulting_run with a private test adapter", () => {
  it("requires an agent and model, then binds a follow-up to the original selection", async () => {
    const { cwd, execute, pi } = await setup();
    const context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
    const tool = pi.tools[0] as {
      execute: (...args: unknown[]) => Promise<{ details?: unknown }>;
      parameters: unknown;
    };
    const initial = {
      prompt: "begin",
      new: { agent: "antigravity", model: "local-model-v2", workspace: false },
    };

    expect(() => JSON.stringify(tool.parameters)).not.toThrow();
    await expect(
      tool.execute(
        "missing-agent",
        {
          prompt: "begin",
          new: { model: "local-model-v2", workspace: false },
        },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow();
    await expect(
      tool.execute(
        "wrong-agent",
        {
          prompt: "begin",
          new: { agent: "unsupported", model: "local-model-v2", workspace: false },
        },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow();
    await expect(
      tool.execute(
        "wrong-model",
        {
          prompt: "begin",
          new: { agent: "antigravity", model: "gemini-3.8-flash-low", workspace: false },
        },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();

    const first = await tool.execute("first", initial, undefined, undefined, context);
    const handle = (first.details as { handle: string }).handle;
    await expect(
      tool.execute(
        "override",
        {
          prompt: "continue",
          continue: { handle, model: "local-model-v2" },
        },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);

    await tool.execute(
      "follow-up",
      { prompt: "continue", continue: { handle } },
      undefined,
      undefined,
      context,
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        model: "local-model-v2",
        workspaceAccess: false,
        canonicalWorkingDirectory: await realpath(join(cwd, "..", "consultation-workspace")),
      }),
    );
    expect(execute.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        model: "local-model-v2",
        workspaceAccess: false,
        continuation: "opaque-continuation",
      }),
    );
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      canonicalWorkingDirectory: execute.mock.calls[0]?.[0].canonicalWorkingDirectory,
    });
    expect(pi.entries).toContainEqual({
      type: CONSULTING_HANDLE_ENTRY_TYPE,
      data: expect.objectContaining({ action: "created" }),
    });
  });

  it("rejects unknown and unsupported-agent handles before adapter work", async () => {
    const execute = vi.fn<ConsultingAgentAdapter["execute"]>(async () => fakeFacts);
    const adapter: ConsultingAgentAdapter = {
      identity: "antigravity",
      consultationWorkspace: "/consultation-workspace",
      discover: async () => ({
        status: "available",
        agent: "antigravity",
        agentVersion: "agent-v1",
        catalogue: ["local-model-v2"],
      }),
      execute,
    };
    const handles = new ConversationHandleStore();
    handles.rebuild([
      {
        type: "custom",
        customType: CONSULTING_HANDLE_ENTRY_TYPE,
        data: {
          version: 1,
          action: "created",
          record: {
            handle: "consult_abcdef",
            agent: "other-agent",
            model: "local-model-v2",
            continuation: "opaque-state",
            canonicalWorkingDirectory: "/workspace",
            workspaceAccess: false,
            agentVersion: "agent-v1",
            status: "active",
          },
        },
      },
    ]);
    const pi = createPiMock();
    registerConsultingRunTool({
      pi: pi as never,
      adapter,
      availability: {
        status: "available",
        agent: "antigravity",
        agentVersion: "agent-v1",
        catalogue: ["local-model-v2"],
      },
      handles,
    });
    const tool = pi.tools[0] as {
      name: string;
      execute: (...args: unknown[]) => Promise<unknown>;
    };
    expect(pi.tools.map((item) => (item as { name: string }).name)).toEqual(["consulting_run"]);
    const context = makeCtx({ cwd: "/workspace" });

    await expect(
      tool.execute(
        "unsupported",
        { prompt: "continue", continue: { handle: "consult_abcdef" } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow(/unsupported Consulting Agent/);
    await expect(
      tool.execute(
        "unknown",
        { prompt: "continue", continue: { handle: "consult_012345" } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow(/Unknown Conversation Handle/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps pre-process failures active and retires a canceled started follow-up", async () => {
    const { cwd, execute, pi } = await setup();
    const context = makeCtx({ cwd, sessionManager: { getBranch: () => [] } });
    const tool = pi.tools[0] as {
      execute: (...args: unknown[]) => Promise<{ details?: unknown }>;
    };
    const first = await tool.execute(
      "first",
      { prompt: "begin", new: { agent: "antigravity", model: "local-model-v2", workspace: false } },
      undefined,
      undefined,
      context,
    );
    const handle = (first.details as { handle: string }).handle;
    execute.mockImplementationOnce(async () => {
      throw new Error("pre-process failure");
    });
    await expect(
      tool.execute(
        "pre-process-failure",
        { prompt: "retry", continue: { handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow("pre-process failure");

    execute.mockImplementationOnce(async (options) => {
      options.onProcessStart?.();
      const error = new Error("canceled after start");
      error.name = "AbortError";
      throw error;
    });
    await expect(
      tool.execute(
        "started-cancellation",
        { prompt: "retry", continue: { handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow("canceled after start");
    const callsAfterRetirement = execute.mock.calls.length;
    await expect(
      tool.execute(
        "retired",
        { prompt: "retry again", continue: { handle } },
        undefined,
        undefined,
        context,
      ),
    ).rejects.toThrow(/retired/);
    expect(execute).toHaveBeenCalledTimes(callsAfterRetirement);
  });
});
