import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness } from "../helpers/background-harness.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
afterEach(async () => {
  await harness?.close();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("saved Agent Conversation checkpoints through registered tools", () => {
  it("keeps duplicate-task and conversation-target errors in preflight order", async () => {
    harness = await backgroundHarness(sdk);
    await expect(
      harness.invoke("agent_run", {
        mode: "foreground",
        tasks: [
          {
            id: "repeat",
            continue: { conversationId: "missing-first" },
            instructions: "Inspect A.",
          },
          { id: "repeat", new: { profile: "explore" }, instructions: "Inspect B." },
          {
            id: "third",
            continue: { conversationId: "missing-last" },
            instructions: "Inspect C.",
          },
        ],
      }),
    ).rejects.toThrow(
      "Delegation Batch preflight failed:\n" +
        'Duplicate task ID "repeat".\n' +
        'Unknown or off-branch conversation reference "missing-first". Use agent_list to see saved conversations on this branch.\n' +
        'Unknown or off-branch conversation reference "missing-last". Use agent_list to see saved conversations on this branch.',
    );
    expect(harness.children).toHaveLength(0);
  });

  it("blocks corrupt latest checkpoints instead of falling back to older context", async () => {
    harness = await backgroundHarness(sdk);
    const firstRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "corrupt-label", new: { profile: "explore" }, instructions: "Inspect A." }],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.finish("A findings.");
    const first = await firstRun;
    const conversationId = (first.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;

    const secondRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        { id: "corrupt-follow-up", continue: { conversationId }, instructions: "Inspect B." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    harness.children[1]?.finish("B findings.");
    await secondRun;
    const latestResult = harness.manager
      .getBranch()
      .filter(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolName === "agent_run",
      )
      .at(-1);
    if (latestResult?.type !== "message" || latestResult.message.role !== "toolResult") {
      throw new Error("Missing stored Agent Run result.");
    }
    const latestTask = (
      latestResult.message.details as {
        tasks: Array<{ checkpoint: { version: number } }>;
      }
    ).tasks[0];
    if (!latestTask) throw new Error("Missing stored checkpoint.");
    latestTask.checkpoint.version = 77;

    const listed = await harness.invoke("agent_list", {});
    expect(listed.details).toMatchObject({
      rows: [
        expect.objectContaining({
          conversationId,
          status: "unavailable",
          reason: expect.stringContaining("unsupported checkpoint version"),
        }),
      ],
    });
    await expect(
      harness.invoke("agent_run", {
        mode: "foreground",
        tasks: [
          { id: "must-not-fallback", continue: { conversationId }, instructions: "Inspect C." },
        ],
      }),
    ).rejects.toThrow("unsupported checkpoint version");
    expect(harness.children).toHaveLength(2);
  });

  it("saves failure context and warns the next run without replaying its actions", async () => {
    harness = await backgroundHarness(sdk);
    const started = await harness.invoke("agent_run", {
      tasks: [
        { id: "failed-deploy", new: { profile: "explore" }, instructions: "Inspect deployment." },
      ],
    });
    const batchId = (started.details as { batchId: string }).batchId;
    const conversationId = (started.details as { tasks: Array<{ conversationId: string }> })
      .tasks[0]?.conversationId;
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.fail();
    const collected = await harness.invoke("agent_result", { batchId, wait: true });
    const failedTask = (
      collected.details as {
        tasks: Array<{ status: string; checkpoint?: { runStatus: string } }>;
      }
    ).tasks[0];
    expect(failedTask).toMatchObject({ status: "failed", checkpoint: { runStatus: "failed" } });

    const followUp = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        { id: "check-deploy", continue: { conversationId }, instructions: "Check actual state." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    const prompt = harness.children[1]?.session.prompt.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("previous Agent Run ended failed");
    expect(prompt).toContain("Do not replay interrupted actions");
    harness.children[1]?.finish("The current deployment state is unchanged.");
    await followUp;
  });

  it("retries a stripped checkpoint without reporting Usage twice or storing a duplicate", async () => {
    harness = await backgroundHarness(sdk);
    const started = await harness.invoke("agent_run", {
      tasks: [
        { id: "retryable", new: { profile: "explore" }, instructions: "Inspect the retry path." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.finish("The retry path stores one checkpoint.");
    const batchId = (started.details as { batchId: string }).batchId;
    const stripped = await harness.invoke(
      "agent_result",
      { batchId, wait: true },
      {
        resultHook: (result) => ({
          details: {
            ...result.details,
            tasks: (result.details.tasks as Array<Record<string, unknown>>).map(
              ({ checkpoint: _checkpoint, ...task }) => task,
            ),
          },
        }),
      },
    );
    expect(stripped.usage?.totalTokens).toBe(15);
    const storedCollection = harness.manager
      .getBranch()
      .find(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolName === "agent_result",
      );
    const storedDetails =
      storedCollection?.type === "message" && storedCollection.message.role === "toolResult"
        ? (storedCollection.message.details as { tasks: Array<{ checkpoint?: unknown }> })
        : undefined;
    expect(storedDetails?.tasks[0]?.checkpoint).toBeUndefined();

    const retry = await harness.invoke("agent_result", { batchId });
    expect(retry.usage).toBeUndefined();
    expect(
      (retry.details as { tasks: Array<{ checkpoint?: unknown }> }).tasks[0]?.checkpoint,
    ).toBeDefined();
    const repeated = await harness.invoke("agent_result", { batchId });
    expect(repeated.usage).toBeUndefined();
    expect(
      (repeated.details as { tasks: Array<{ checkpoint?: unknown }> }).tasks[0]?.checkpoint,
    ).toBeUndefined();
  });

  it("uses only checkpoints on the active parent branch", async () => {
    harness = await backgroundHarness(sdk);
    const firstRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "branch-label", new: { profile: "explore" }, instructions: "Inspect A." }],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.finish("Finding from A.");
    const first = await firstRun;
    const conversationId = (first.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;
    const firstCheckpoint = (
      first.details as {
        tasks: Array<{ checkpoint: { checkpointId: string; parentCheckpointId: string | null } }>;
      }
    ).tasks[0]?.checkpoint;
    const firstResultEntry = harness.manager
      .getBranch()
      .find(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolName === "agent_run",
      );
    expect(firstCheckpoint?.checkpointId).toEqual(expect.any(String));
    expect(firstResultEntry?.id).toEqual(expect.any(String));

    const secondRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "branch-b", continue: { conversationId }, instructions: "Inspect B." }],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    harness.children[1]?.finish("Finding from B.");
    const second = await secondRun;
    const secondCheckpoint = (
      second.details as {
        tasks: Array<{ checkpoint: { checkpointId: string; parentCheckpointId: string | null } }>;
      }
    ).tasks[0]?.checkpoint;
    expect(secondCheckpoint?.parentCheckpointId).toBe(firstCheckpoint?.checkpointId);

    harness.manager.branch(firstResultEntry?.id ?? "");
    const thirdRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "off-branch", continue: { conversationId }, instructions: "Inspect C." }],
    });
    await vi.waitFor(() => expect(harness?.children[2]?.session.isStreaming).toBe(true));
    harness.children[2]?.finish("Finding from C.");
    await thirdRun;
    const third = harness.children[2];
    const thirdEntries = third?.session.sessionManager.getEntries() ?? [];
    expect(JSON.stringify(thirdEntries)).toContain("Finding from A.");
    expect(JSON.stringify(thirdEntries)).not.toContain("Finding from B.");
    const thirdResult = harness.manager
      .getBranch()
      .filter(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "toolResult" &&
          entry.message.toolName === "agent_run",
      )
      .at(-1);
    const thirdCheckpoint =
      thirdResult?.type === "message" && thirdResult.message.role === "toolResult"
        ? (
            thirdResult.message.details as {
              tasks: Array<{ checkpoint: { parentCheckpointId: string | null } }>;
            }
          ).tasks[0]?.checkpoint
        : undefined;
    expect(thirdCheckpoint?.parentCheckpointId).toBe(firstCheckpoint?.checkpointId);
  });

  it("rejects duplicate conversation targets before it starts any task", async () => {
    harness = await backgroundHarness(sdk);
    const firstRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "base", new: { profile: "explore" }, instructions: "Inspect the base." }],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.finish("Base findings.");
    const first = await firstRun;
    const conversationId = (first.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;
    const before = harness.children.length;

    await expect(
      harness.invoke("agent_run", {
        mode: "foreground",
        tasks: [
          { id: "first-target", continue: { conversationId }, instructions: "Check A." },
          { id: "second-target", continue: { conversationId }, instructions: "Check B." },
        ],
      }),
    ).rejects.toThrow("Duplicate conversation target");
    expect(harness.children).toHaveLength(before);
  });
});
