import { SessionManager } from "@earendil-works/pi-coding-agent";
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

describe("native parent session copies", () => {
  it("keeps forked and cloned child histories independent after disk reopen", async () => {
    harness = await backgroundHarness(sdk, { persistentParent: true });
    const first = await runForeground("A", undefined, "A findings.");
    const conversationId = first.conversationId;
    const firstResultId = latestAgentRunEntryId();
    const second = await runForeground("B", conversationId, "B findings.");
    const secondResultId = latestAgentRunEntryId();
    const sourcePath = harness.manager.getSessionFile();
    if (!sourcePath) throw new Error("Missing parent session file.");

    const forkPath = SessionManager.open(sourcePath).createBranchedSession(firstResultId);
    const clonePath = SessionManager.open(sourcePath).createBranchedSession(secondResultId);
    if (!forkPath || !clonePath) throw new Error("Pi did not create the saved session copies.");

    await harness.openParent(SessionManager.open(forkPath));
    expect((await harness.invoke("agent_list", {})).details).toMatchObject({
      total: 1,
      rows: [expect.objectContaining({ conversationId, status: "available" })],
    });
    const emptyPage = await harness.invoke("agent_list", { offset: 20 });
    expect(emptyPage.content).toEqual([
      { type: "text", text: "No Agent Conversations at offset 20; 1 total." },
    ]);
    expect(JSON.stringify(harness.manager.getBranch())).not.toContain("Inspect B module.");
    const forkRun = startFollowUp(conversationId, "C-fork");
    await waitForChild(2);
    const forkEntries = harness.children[2]?.session.sessionManager.getEntries();
    expect(JSON.stringify(forkEntries)).toContain("A findings.");
    expect(JSON.stringify(forkEntries)).not.toContain("B findings.");
    harness.children[2]?.finish("Fork-only finding.");
    const forkResult = await forkRun;
    expect(checkpoint(forkResult)?.parentCheckpointId).toBe(first.checkpointId);

    await harness.openParent(SessionManager.open(clonePath));
    const cloneRun = startFollowUp(conversationId, "D-clone");
    await waitForChild(3);
    const cloneEntries = harness.children[3]?.session.sessionManager.getEntries();
    expect(JSON.stringify(cloneEntries)).toContain("A findings.");
    expect(JSON.stringify(cloneEntries)).toContain("B findings.");
    expect(JSON.stringify(cloneEntries)).not.toContain("Fork-only finding.");
    harness.children[3]?.finish("Clone-only finding.");
    const cloneResult = await cloneRun;
    expect(checkpoint(cloneResult)?.parentCheckpointId).toBe(second.checkpointId);

    await harness.openParent(SessionManager.open(sourcePath));
    const sourceRun = startFollowUp(conversationId, "E-source");
    await waitForChild(4);
    const sourceEntries = harness.children[4]?.session.sessionManager.getEntries();
    expect(JSON.stringify(sourceEntries)).toContain("A findings.");
    expect(JSON.stringify(sourceEntries)).toContain("B findings.");
    expect(JSON.stringify(sourceEntries)).not.toContain("Fork-only finding.");
    expect(JSON.stringify(sourceEntries)).not.toContain("Clone-only finding.");
    harness.children[4]?.finish("Source-only finding.");
    const sourceResult = await sourceRun;
    expect(checkpoint(sourceResult)?.parentCheckpointId).toBe(second.checkpointId);
  }, 10_000);
});

async function runForeground(
  id: string,
  conversationId: string | undefined,
  text: string,
): Promise<{ conversationId: string; checkpointId: string }> {
  if (!harness) throw new Error("Missing test harness.");
  const run = harness.invoke("agent_run", {
    mode: "foreground",
    tasks: [
      conversationId
        ? { id, continue: { conversationId }, instructions: `Inspect ${id} module.` }
        : { id, new: { profile: "explore" }, instructions: `Inspect ${id} module.` },
    ],
  });
  const index = harness.children.length;
  await waitForChild(index);
  harness.children[index]?.finish(text);
  const result = await run;
  const task = (
    result.details as {
      tasks: Array<{ conversationId: string; checkpoint: { checkpointId: string } }>;
    }
  ).tasks[0];
  if (!task) throw new Error("Missing conversation result.");
  return { conversationId: task.conversationId, checkpointId: task.checkpoint.checkpointId };
}

function startFollowUp(conversationId: string, id: string) {
  if (!harness) throw new Error("Missing test harness.");
  return harness.invoke("agent_run", {
    mode: "foreground",
    tasks: [{ id, continue: { conversationId }, instructions: `Inspect ${id} module.` }],
  });
}

async function waitForChild(index: number): Promise<void> {
  await vi.waitFor(() => expect(harness?.children[index]?.session.isStreaming).toBe(true));
}

function latestAgentRunEntryId(): string {
  if (!harness) throw new Error("Missing test harness.");
  const entry = harness.manager
    .getBranch()
    .filter(
      (item) =>
        item.type === "message" &&
        item.message.role === "toolResult" &&
        item.message.toolName === "agent_run",
    )
    .at(-1);
  if (!entry) throw new Error("Missing stored Agent Run result.");
  return entry.id;
}

function checkpoint(result: { details: unknown }) {
  return (
    result.details as {
      tasks: Array<{ checkpoint?: { parentCheckpointId: string | null } }>;
    }
  ).tasks[0]?.checkpoint;
}
