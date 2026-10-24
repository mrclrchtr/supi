import { afterEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...(await original<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

import {
  configureDebugRegistry,
  getDebugEvents,
  subscribeDebugPersistence,
} from "@mrclrchtr/supi-core/debug";
import { backgroundHarness, task } from "../helpers/background-harness.ts";

let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
let detach: (() => void) | undefined;
afterEach(async () => {
  await harness?.close();
  detach?.();
  configureDebugRegistry({ enabled: false, agentRunRetrospectivesEnabled: false });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("returns foreground results before the retrospective and logs its separate Usage", async () => {
  harness = await backgroundHarness(sdk);
  configureDebugRegistry({ enabled: true, agentRunRetrospectivesEnabled: true });
  detach = subscribeDebugPersistence(vi.fn());
  let returned = false;
  const running = harness
    .invoke("agent_run", { tasks: [task()], mode: "foreground" })
    .then((value) => {
      returned = true;
      return value;
    });
  await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
  const child = harness.child("one");
  child.finish("Task answer");
  await vi.waitFor(() => expect(returned).toBe(true));
  const result = await running;
  expect(result.usage?.totalTokens).toBe(15);
  await vi.waitFor(() => expect(child.session.prompt).toHaveBeenCalledTimes(2));
  expect(child.runtime.dispose).not.toHaveBeenCalled();
  expect(harness.registry.hasActive()).toBe(true);

  child.finish("Parent could have supplied the implementation path.");
  await vi.waitFor(() => expect(child.runtime.dispose).toHaveBeenCalledOnce());
  expect(result.usage?.totalTokens).toBe(15);
  const event = getDebugEvents({ category: "agent-run-retrospective", source: "supi-agent" })
    .events[0];
  expect(event?.data).toMatchObject({
    text: "Parent could have supplied the implementation path.",
    usage: { total: 15 },
  });
});

it("collects background checkpoints before the retrospective and cancels its remaining work", async () => {
  harness = await backgroundHarness(sdk);
  configureDebugRegistry({ enabled: true, agentRunRetrospectivesEnabled: true });
  detach = subscribeDebugPersistence(vi.fn());
  const start = await harness.invoke("agent_run", { tasks: [task()] });
  await vi.waitFor(() => expect(harness?.children[0]?.session.isStreaming).toBe(true));
  const child = harness.child("one");
  child.finish("Task answer");
  await vi.waitFor(() => expect(child.session.prompt).toHaveBeenCalledTimes(2));
  const result = await harness.invoke("agent_result", {
    batchId: start.details.batchId,
    wait: true,
  });
  expect(result.usage?.totalTokens).toBe(15);
  expect(JSON.stringify(result.details)).not.toContain("Reflect briefly");
  expect(child.runtime.dispose).not.toHaveBeenCalled();
  const conversationId = (result.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
    ?.conversationId;
  await harness.invoke("agent_run", {
    tasks: [
      { id: "follow-up", continue: { conversationId }, instructions: "Inspect follow-up module." },
    ],
  });
  await vi.waitFor(() => expect(harness?.children[1]?.session.isStreaming).toBe(true));
  const followUp = harness.child("follow-up");
  const restored = JSON.stringify(followUp.session.sessionManager.getEntries());
  expect(restored).toContain("Task answer");
  expect(restored).not.toContain("Reflect briefly");
  await harness.invoke("agent_cancel", { batchId: start.details.batchId });
  await vi.waitFor(() => expect(child.runtime.dispose).toHaveBeenCalledOnce());
  expect(followUp.session.isStreaming).toBe(true);
  expect(result.usage?.totalTokens).toBe(15);
});
