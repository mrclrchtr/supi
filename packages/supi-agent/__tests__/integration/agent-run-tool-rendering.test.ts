import type { AgentRunHandle, StartAgentRunOptions } from "@mrclrchtr/supi-agent-runtime/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import agentExtension from "../../src/extension.ts";
import {
  context,
  type RegisteredAgentRunTool,
  type RunDoubleConfig,
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

function installRunDouble(config: RunDoubleConfig): void {
  mocks.startAgentRun.mockImplementationOnce((options: StartAgentRunOptions<string>) =>
    runDouble(options, config),
  );
}

function defaultRun(options: StartAgentRunOptions<string>): AgentRunHandle<string> {
  return runDouble(options, { value: "controlled result" });
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

describe("registered supi_agent_run rendering boundary", () => {
  it("renders safe activity from the registered run's session events", async () => {
    const tool = await registeredTool();
    installRunDouble({
      events: [
        {
          type: "tool_execution_start",
          toolCallId: "read-1",
          toolName: "read",
          args: { path: "src/app.ts" },
        },
        {
          type: "tool_execution_end",
          toolCallId: "read-1",
          toolName: "read",
          result: "ok",
          isError: false,
        },
      ],
    });
    const updates: unknown[] = [];
    await tool.execute(
      "call-1",
      { tasks: [{ id: "task-1", profile: "explore", instructions: "inspect" }] },
      undefined,
      (update: unknown) => updates.push(update),
      context(),
    );
    const liveUpdate = updates.find((update) => {
      const tasks = (
        update as { details?: { tasks?: Array<{ recentActivity?: readonly string[] }> } }
      ).details?.tasks;
      return tasks?.some((task) => task.recentActivity?.at(-1) === "tool:end:read") ?? false;
    });
    if (!liveUpdate) throw new Error("No live activity update was published.");

    const text = render(
      tool.renderResult(liveUpdate, { expanded: true, isPartial: true }, theme, {}),
    );
    expect(text).toContain("tool:start:read src/app.ts");
    expect(text).toContain("tool:end:read");
    expect(text).not.toContain("tool:end:read src/app.ts");
  });

  it("redacts credentials and keeps benign git upstream flags in expanded activity", async () => {
    const tool = await registeredTool();
    installRunDouble({
      messages: [
        { role: "user", content: "inspect", timestamp: 0 },
        {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "bash-1",
              name: "bash",
              arguments: {
                command: "curl -u user:s3cr3t https://example.test; git push -u origin main", // gitleaks:allow
              },
            },
          ],
          timestamp: 0,
        },
        {
          role: "toolResult",
          toolCallId: "bash-1",
          toolName: "bash",
          content: [],
          isError: false,
          timestamp: 0,
        },
      ],
    });
    const result = await tool.execute(
      "call-1",
      { tasks: [{ id: "task-1", profile: "explore", instructions: "inspect" }] },
      undefined,
      undefined,
      context(),
    );
    const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, theme, {});
    const text = render(expanded);

    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("s3cr3t");
    expect(text).toContain("git push -u origin main");
  });

  it("renders failure, canceled, timeout, and truncated terminal states", async () => {
    const tool = await registeredTool();
    const final = tool.renderResult(
      {
        details: {
          tasks: [
            {
              taskId: "failed-task",
              profileId: "explore",
              status: "failed",
              failureCode: "prompt-rejected",
              turns: 1,
              toolUses: 0,
              humanTruncated: false,
              modelTruncated: false,
            },
            {
              taskId: "canceled-task",
              profileId: "explore",
              status: "canceled",
              turns: 2,
              toolUses: 1,
              humanTruncated: false,
              modelTruncated: false,
            },
            {
              taskId: "timeout-task",
              profileId: "explore",
              status: "timeout",
              turns: 3,
              toolUses: 2,
              humanTruncated: false,
              modelTruncated: false,
            },
            {
              taskId: "truncated-task",
              profileId: "explore",
              status: "completed",
              turns: 4,
              toolUses: 3,
              finalTextFull: "bounded output",
              humanTruncated: true,
              modelTruncated: true,
            },
          ],
        },
      },
      { expanded: true, isPartial: false },
      theme,
      {},
    );
    const text = render(final);

    expect(text).toContain("failed (prompt-rejected)");
    expect(text).toContain("canceled");
    expect(text).toContain("timeout");
    expect(text).toContain("truncated-task");
    expect(text).toContain("[truncated]");
  });

  it("renders bounded conversation details and omission counts when expanded", async () => {
    const tool = await registeredTool();
    const oldText = "o".repeat(30_000);
    const newText = "n".repeat(30_000);
    installRunDouble({
      value: "final output",
      messages: [
        { role: "user", content: "initial prompt", timestamp: 0 },
        { role: "assistant", content: [{ type: "text", text: oldText }], timestamp: 0 },
        { role: "assistant", content: [{ type: "text", text: newText }], timestamp: 0 },
      ],
    });
    const result = (await tool.execute(
      "call-1",
      {
        sharedContext: "shared context",
        tasks: [{ id: "task-1", profile: "explore", instructions: "inspect the repository" }],
      },
      undefined,
      undefined,
      context(),
    )) as {
      details: {
        sharedContext?: string;
        conversationViews: Record<
          string,
          {
            entries: readonly { text?: string }[];
            omittedEntryCount: number;
            omittedCharacterCount: number;
            textTruncated: boolean;
            taskMetadata: { instructions: string };
          }
        >;
      };
    };
    const view = result.details.conversationViews["task-1"];
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]?.text).toBe(newText);
    expect(view.omittedEntryCount).toBe(1);
    expect(view.omittedCharacterCount).toBe(oldText.length);
    expect(view.textTruncated).toBe(true);
    expect(view.taskMetadata).toEqual({ instructions: "inspect the repository" });
    expect(result.details.sharedContext).toBe("shared context");

    const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, theme, {});
    const text = render(expanded);
    expect(text).toContain("shared context");
    expect(text).toContain("inspect the repository");
    expect(text).toContain("1 conversation entry and 30,000 characters omitted (text bound)");
  });
});
