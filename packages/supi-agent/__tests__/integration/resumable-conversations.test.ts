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

describe("resumable conversations through registered tools", () => {
  it("lists saved and live-only conversations without exposing child context", async () => {
    harness = await backgroundHarness(sdk);
    const savedRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        { id: "saved-label", new: { profile: "explore" }, instructions: "Inspect saved context." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.finish("Private saved findings.");
    const saved = await savedRun;
    const savedId = (saved.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;
    const started = await harness.invoke("agent_run", {
      tasks: [
        { id: "live-label", new: { profile: "explore" }, instructions: "Inspect live context." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    const liveId = (started.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;

    const listed = await harness.invoke("agent_list", {});
    expect(listed.details).toMatchObject({
      total: 2,
      rows: [
        {
          conversationId: savedId,
          label: "saved-label",
          profileId: "explore",
          status: "available",
        },
        {
          conversationId: liveId,
          label: "live-label",
          profileId: "explore",
          status: "busy",
          activity: "busy",
        },
      ],
    });
    expect(JSON.stringify(listed)).not.toMatch(/Private saved findings|Inspect live context/);
  });

  it("continues a saved conversation with only the new child entries in its checkpoint", async () => {
    harness = await backgroundHarness(sdk);
    const firstRun = harness.invoke("agent_run", {
      mode: "foreground",
      sharedContext: "Observed: deploy.yml:12 starts a worker pool.",
      tasks: [
        {
          id: "deployment",
          new: { profile: "explore" },
          instructions: "Inspect deployment configuration.",
        },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.finish("Deployment uses a worker pool.");
    const first = await firstRun;
    const firstTask = (first.details as { tasks: unknown[] }).tasks[0] as {
      conversationId: string;
      checkpoint: { checkpointId: string; entries: unknown[]; parentCheckpointId: string | null };
    };

    const followUp = harness.invoke("agent_run", {
      mode: "foreground",
      sharedContext: "Changed: deploy.yml now reads production secrets from the service account.",
      tasks: [
        {
          id: "deployment-secrets",
          continue: { conversationId: firstTask.conversationId },
          instructions: "Check how production secrets reach the service.",
        },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    harness.children[1]?.finish("Secrets enter through the deploy job.");
    const second = await followUp;
    const secondTask = (second.details as { tasks: unknown[] }).tasks[0] as {
      conversationId: string;
      checkpoint: { checkpointId: string; entries: unknown[]; parentCheckpointId: string | null };
    };

    const newPrompt = harness.children[1]?.session.prompt.mock.calls[0]?.[0];
    expect(newPrompt).toContain("Changed: deploy.yml now reads production secrets");
    expect(newPrompt).toContain("Check how production secrets reach the service.");
    expect(newPrompt).not.toContain("Observed: deploy.yml:12");
    expect(newPrompt).not.toContain("Inspect deployment configuration.");
    expect(secondTask.conversationId).toBe(firstTask.conversationId);
    expect(secondTask.checkpoint.parentCheckpointId).toBe(firstTask.checkpoint.checkpointId);
    expect(secondTask.checkpoint.entries).toHaveLength(2);
    const restoredEntries = harness.children[1]?.session.sessionManager.getEntries() as Array<{
      type: string;
      message?: { role?: string; content?: unknown };
    }>;
    expect(restoredEntries.some((entry) => JSON.stringify(entry).includes("worker pool"))).toBe(
      true,
    );
    expect(
      restoredEntries.some((entry) => JSON.stringify(entry).includes("production secrets")),
    ).toBe(true);
    expect(
      restoredEntries.some((entry) => JSON.stringify(entry).includes("Observed: deploy.yml:12")),
    ).toBe(true);

    const listed = await harness.invoke("agent_list", {});
    expect(listed.details).toMatchObject({
      total: 1,
      rows: [
        {
          conversationId: firstTask.conversationId,
          label: "deployment",
          profileId: "explore",
          status: "available",
        },
      ],
    });
    expect(JSON.stringify(listed.details)).not.toContain("worker pool");
  });

  it("reconstructs saved conversations after the parent extension reloads", async () => {
    harness = await backgroundHarness(sdk);
    const firstRun = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        { id: "resume-label", new: { profile: "explore" }, instructions: "Inspect the API." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
    harness.children[0]?.finish("The API has a stable boundary.");
    const first = await firstRun;
    const conversationId = (first.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;
    const sourceManager = harness.manager;
    const sourceEntryCount = sourceManager.getEntryCount();

    await harness.reopenParent();
    const listed = await harness.invoke("agent_list", {});
    expect(listed.details).toMatchObject({
      rows: [
        expect.objectContaining({ conversationId, label: "resume-label", status: "available" }),
      ],
    });
    const followUp = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        { id: "resume-api", continue: { conversationId }, instructions: "Check API callers." },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    harness.children[1]?.finish("The callers use the public interface.");
    await followUp;
    expect(JSON.stringify(harness.children[1]?.session.sessionManager.getEntries())).toContain(
      "stable boundary",
    );
    expect(sourceManager.getEntryCount()).toBe(sourceEntryCount);
  });

  it("requires background result collection before a conversation follow-up", async () => {
    harness = await backgroundHarness(sdk);
    const started = await harness.invoke("agent_run", {
      tasks: [
        {
          id: "live-deploy",
          new: { profile: "explore" },
          instructions: "Inspect the deployment process.",
        },
      ],
    });
    const batchId = (started.details as { batchId: string }).batchId;
    const progressTask = (started.details as { tasks: Array<{ conversationId: string }> }).tasks[0];
    const conversationId = progressTask?.conversationId;
    expect(conversationId).toEqual(expect.any(String));
    await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));

    const busyList = await harness.invoke("agent_list", {});
    expect(busyList.details).toMatchObject({
      rows: [expect.objectContaining({ conversationId, status: "busy" })],
    });
    await expect(
      harness.invoke("agent_run", {
        tasks: [
          {
            id: "too-soon",
            continue: { conversationId: conversationId ?? "missing" },
            instructions: "Check production secrets.",
          },
        ],
      }),
    ).rejects.toThrow("already has an active Agent Run");
    expect(harness.children).toHaveLength(1);
    harness.children[0]?.finish("Deployment uses a worker pool.");
    await vi.waitFor(async () => {
      const listed = await harness?.invoke("agent_list", {});
      expect(listed?.details).toMatchObject({
        rows: [expect.objectContaining({ conversationId, status: "pending-collection" })],
      });
    });

    await expect(
      harness.invoke("agent_run", {
        tasks: [
          {
            id: "too-early",
            continue: { conversationId: conversationId ?? "missing" },
            instructions: "Check production secrets.",
          },
        ],
      }),
    ).rejects.toThrow("Collect it with agent_result");
    expect(harness.children).toHaveLength(1);

    const collection = await harness.invoke("agent_result", { batchId, wait: true });
    const collectedTask = (collection.details as { tasks: Array<{ checkpoint?: unknown }> })
      .tasks[0];
    expect(collectedTask?.checkpoint).toBeDefined();
    const followUp = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        {
          id: "after-collection",
          continue: { conversationId: conversationId ?? "missing" },
          instructions: "Check production secrets.",
        },
      ],
    });
    await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
    harness.children[1]?.finish("Secrets enter through the deploy job.");
    await followUp;
  });
});
