import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRunHandle, StartAgentRunOptions } from "@mrclrchtr/supi-agent-runtime/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import agentExtension from "../../src/extension.ts";
import { registry } from "../../src/tool/agent_run/register.ts";
import {
  context,
  type RegisteredAgentRunTool,
  registerAgentRunToolForTest,
  render,
  runDouble,
  type Shutdown,
  shutdownRegisteredTools,
  theme,
} from "../helpers/agent-run-fixtures.ts";

const mocks = vi.hoisted(() => ({
  startAgentRun: vi.fn(),
  combineAgentRunUsage: vi.fn(() => undefined),
  createAgentRunProviderAuthority: vi.fn(() => ({
    getProvider: () => undefined,
    getProviderAuth: async () => undefined,
  })),
}));

vi.mock("@mrclrchtr/supi-agent-runtime/api", () => ({
  startAgentRun: mocks.startAgentRun,
  combineAgentRunUsage: mocks.combineAgentRunUsage,
  createAgentRunProviderAuthority: mocks.createAgentRunProviderAuthority,
}));

function defaultRun(options: StartAgentRunOptions<string>): AgentRunHandle<string> {
  return runDouble(options, { value: "x".repeat(60_000) });
}

const shutdowns: Shutdown[] = [];

function registeredTool(): Promise<RegisteredAgentRunTool> {
  return registerAgentRunToolForTest(agentExtension, shutdowns);
}

beforeEach(() => {
  mocks.startAgentRun.mockReset();
  mocks.startAgentRun.mockImplementation(defaultRun);
});

afterEach(async () => {
  await shutdownRegisteredTools(shutdowns);
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("registered agent_run boundary", () => {
  it("bounds task instructions at 16,000 characters in the registered schema", async () => {
    const tool = await registeredTool();
    const schema = tool.parameters as {
      properties: {
        tasks: {
          items: {
            properties: {
              instructions: { maxLength: number };
            };
          };
        };
      };
    };

    expect(schema.properties.tasks.items.properties.instructions.maxLength).toBe(16_000);
  });

  it("rejects invalid input before starting a batch", async () => {
    const tool = await registeredTool();
    await expect(
      tool.execute(
        "call-1",
        {
          tasks: [{ id: "task-1", profile: "explore", instructions: "x".repeat(16_001) }],
        },
        undefined,
        undefined,
        context(),
      ),
    ).rejects.toThrow("Invalid agent_run input");
    expect(mocks.startAgentRun).not.toHaveBeenCalled();
  });

  it("keeps both output lanes within their bounds through the registered tool", async () => {
    const tool = await registeredTool();
    const result = (await tool.execute(
      "call-1",
      { tasks: [{ id: "task-1", profile: "explore", instructions: "inspect" }] },
      undefined,
      undefined,
      context(),
    )) as {
      details: {
        tasks: Array<{ finalText: string; finalTextFull: string }>;
        transcriptSources?: unknown;
        runKeys?: unknown;
      };
    };

    expect(result.details.tasks[0]?.finalText.length).toBeLessThanOrEqual(16_000);
    expect(result.details.tasks[0]?.finalText).toContain("[truncated:");
    expect(result.details.tasks[0]?.finalTextFull.length).toBeLessThanOrEqual(51_200);
    expect(result.details.tasks[0]?.finalTextFull).toContain("[truncated:");
    expect(result.details).not.toHaveProperty("transcriptSources");
    expect(result.details).not.toHaveProperty("runKeys");
  });

  it("continues a run when temporary transcript storage fails", async () => {
    const missingParent = join(tmpdir(), `supi-agent-missing-${randomUUID()}`);
    vi.stubEnv("TMPDIR", join(missingParent, "nested"));
    const tool = await registeredTool();
    const result = (await tool.execute(
      "call-storage-failure",
      { tasks: [{ id: "task-1", profile: "explore", instructions: "inspect" }] },
      undefined,
      undefined,
      context(),
    )) as { content: Array<{ text: string }>; details: { tasks: Array<{ status: string }> } };

    expect(result.details.tasks[0]?.status).toBe("completed");
    expect(result.content[0]?.text).toContain("x".repeat(10));
    expect(result.details).not.toHaveProperty("transcriptSources");
    const source = Object.values(registry.snapshot().batches[0]?.transcriptSources ?? {})[0];
    expect(source?.getStatus().status).toBe("incomplete");
    await expect(source?.load()).resolves.toMatchObject({ status: "incomplete" });
    await rm(missingParent, { recursive: true, force: true });
  });

  it("renders live lifecycle states, progress metrics, and safe recent activity", async () => {
    const tool = await registeredTool();
    const partial = tool.renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "starting-task",
              profileId: "explore",
              status: "starting",
              turns: 0,
              toolUses: 0,
              recentActivity: ["turn:start"],
            },
            {
              taskId: "running-task",
              profileId: "explore",
              status: "running",
              turns: 2,
              toolUses: 3,
              usage: { totalTokens: 1_234 },
              recentActivity: ["read src/app.ts"],
            },
            {
              taskId: "stopping-task",
              profileId: "explore",
              status: "stopping",
              turns: 4,
              toolUses: 5,
              recentActivity: ["tool:end:bash:error"],
            },
          ],
          completedCount: 0,
          totalCount: 3,
        },
      },
      { expanded: false, isPartial: true },
      theme,
      {},
    );
    const text = render(partial);

    expect(text).toContain("starting");
    expect(text).toContain("running");
    expect(text).toContain("stopping");
    expect(text).toContain("2 turns");
    expect(text).toContain("3 tools");
    expect(text).toContain("1,234 tokens");
    expect(text).toContain("read src/app.ts");
  });
});
