import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness } from "../helpers/background-harness.ts";
import { writeProfile } from "../helpers/profile-fixtures.ts";

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

describe("current profile policy for saved conversations", () => {
  it("applies an updated profile and rejects a profile that becomes unavailable", async () => {
    harness = await backgroundHarness(sdk);
    const conversationId = await saveA("explore");
    const profileRoot = join(harness.agentDir, "supi", "agents");
    await writeProfile(profileRoot, "explore", { tools: ["read"] });
    await harness.pi.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
    await harness.pi.emit(
      "session_start",
      { type: "session_start", reason: "reload" },
      harness.ctx,
    );

    const followUp = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "B", continue: { conversationId }, instructions: "Inspect B module." }],
    });
    await waitForChild(1);
    const inputs = sdk.createAgentSession.mock.calls.at(-1)?.[0] as { tools: string[] };
    expect(inputs.tools).toEqual(["read"]);
    harness.children[1]?.finish("B findings.");
    await followUp;

    await writeProfile(profileRoot, "explore", { enabled: false, tools: ["read"] });
    await harness.pi.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
    await harness.pi.emit(
      "session_start",
      { type: "session_start", reason: "reload" },
      harness.ctx,
    );
    const listed = await harness.invoke("agent_list", {});
    expect(listed.details).toMatchObject({
      rows: [
        expect.objectContaining({
          conversationId,
          status: "unavailable",
          reason: expect.stringContaining("unknown or unavailable"),
        }),
      ],
    });
    const previousCount = harness.children.length;
    await expect(
      harness.invoke("agent_run", {
        mode: "foreground",
        tasks: [{ id: "C", continue: { conversationId }, instructions: "Inspect C module." }],
      }),
    ).rejects.toThrow('Agent Profile "explore" is unknown or unavailable.');
    expect(harness.children).toHaveLength(previousCount);
  });

  it("uses the same mutation-capable conversation for review instructions", async () => {
    harness = await backgroundHarness(sdk);
    const conversationId = await saveA("general");
    const firstCheckpoint = lastCheckpoint();
    const review = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        {
          id: "review",
          continue: { conversationId },
          instructions: "Review the implementation and correct any defects you find.",
        },
      ],
    });
    await waitForChild(1);
    const child = harness.children[1];
    const prompt = child?.session.prompt.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("Review the implementation and correct any defects you find.");
    expect(JSON.stringify(child?.session.sessionManager.getEntries())).toContain(
      "Inspect A module.",
    );
    const inputs = sdk.createAgentSession.mock.calls.at(-1)?.[0] as { tools: string[] };
    expect(inputs.tools).toEqual(expect.arrayContaining(["edit", "write"]));
    child?.finish("The reviewed implementation is correct.");
    const result = await review;
    expect(taskCheckpoint(result)?.parentCheckpointId).toBe(firstCheckpoint?.checkpointId);
    expect(harness.children).toHaveLength(2);
  });
});

async function saveA(profile: "explore" | "general"): Promise<string> {
  if (!harness) throw new Error("Missing test harness.");
  const run = harness.invoke("agent_run", {
    mode: "foreground",
    tasks: [{ id: "A", new: { profile }, instructions: "Inspect A module." }],
  });
  await waitForChild(0);
  harness.children[0]?.finish("A findings.");
  const result = await run;
  const conversationId = (result.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
    ?.conversationId;
  if (!conversationId) throw new Error("Missing conversation reference.");
  return conversationId;
}

async function waitForChild(index: number): Promise<void> {
  await vi.waitFor(() => expect(harness?.children[index]?.session.isStreaming).toBe(true));
}

function lastCheckpoint() {
  if (!harness) throw new Error("Missing test harness.");
  const result = harness.manager
    .getBranch()
    .filter(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "agent_run",
    )
    .at(-1);
  if (result?.type !== "message" || result.message.role !== "toolResult") {
    throw new Error("Missing saved Agent Run result.");
  }
  return (
    result.message.details as {
      tasks: Array<{ checkpoint?: { checkpointId: string; parentCheckpointId: string | null } }>;
    }
  ).tasks[0]?.checkpoint;
}

function taskCheckpoint(result: { details: unknown }) {
  return (
    result.details as {
      tasks: Array<{ checkpoint?: { parentCheckpointId: string | null } }>;
    }
  ).tasks[0]?.checkpoint;
}
