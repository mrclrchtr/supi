import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getTools } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as runtimeApi from "../../src/api.ts";
import { createTestOwner, ownerHarness, type RuntimeApi } from "../helpers/run-batch-owner.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));
let harness: Awaited<ReturnType<typeof ownerHarness>> | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

type Renderable = { render(width: number): string[] };
type RenderingTool = {
  renderResult(result: unknown, options: unknown, theme: unknown, context?: unknown): Renderable;
};
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

/**
 * Two owner packages on one extension event bus: Alpha sends per-task notices through the
 * runtime under test, Beta sends one notice per batch through a separately loaded runtime copy
 * and a distinct extension API, as a second bundled installation would.
 */
async function twoOwners() {
  vi.resetModules();
  const bundledCopy = (await import("../../src/api.ts")) as RuntimeApi;
  const alpha = createTestOwner(runtimeApi, {
    label: "alpha",
    startTool: "alpha_run",
    noticeType: "alpha-notice",
  });
  const beta = createTestOwner(bundledCopy, {
    label: "beta",
    startTool: "beta_run",
    noticeType: "beta-notice",
    noticeGranularity: "batch",
  });
  const betaRegistrations: string[] = [];
  harness = await ownerHarness(sdk, (pi) => {
    alpha(pi);
    beta({
      ...pi,
      registerTool: (tool: { name: string }) => {
        betaRegistrations.push(tool.name);
        pi.registerTool(tool as never);
      },
    } as ExtensionAPI);
  });
  return { harness, betaRegistrations };
}

async function start(tool: string, taskIds: string[]) {
  if (!harness) throw new Error("Missing harness.");
  const streaming = harness.children.filter((child) => child.session.isStreaming).length;
  const started = await harness.invoke(tool, { tasks: taskIds });
  await vi.waitFor(() =>
    expect(harness?.children.filter((child) => child.session.isStreaming)).toHaveLength(
      streaming + taskIds.length,
    ),
  );
  return started.details.batchId as string;
}

const text = (result: { content: unknown }) => JSON.stringify(result.content);

describe("runtime-owned collection tools", () => {
  it("registers agent_result and agent_cancel once for two owners on one event bus", async () => {
    const { harness, betaRegistrations } = await twoOwners();
    const names = getTools(harness.pi).map((tool) => tool.name);
    expect(names.filter((name) => name === "agent_result")).toHaveLength(1);
    expect(names.filter((name) => name === "agent_cancel")).toHaveLength(1);
    expect(betaRegistrations).toEqual(["beta_run"]);
  });

  it("collects and cancels each owner's batch in that owner's format", async () => {
    const { harness } = await twoOwners();
    const alphaBatch = await start("alpha_run", ["a1"]);
    const betaBatch = await start("beta_run", ["b1"]);
    harness.child("a1").finish("Alpha output");
    harness.child("b1").finish("Beta output");

    const alpha = await harness.invoke("agent_result", { batchId: alphaBatch, wait: true });
    const beta = await harness.invoke("agent_result", { batchId: betaBatch, wait: true });
    expect(text(alpha)).toContain("alpha:");
    expect(text(alpha)).toContain("Alpha output");
    expect(text(alpha)).not.toContain("Beta output");
    expect(text(beta)).toContain("beta:");
    expect(text(beta)).toContain("Beta output");
    expect(alpha.usage?.totalTokens).toBe(15);
    expect(beta.usage?.totalTokens).toBe(15);

    const tool = getTools(harness.pi).find(
      (entry) => entry.name === "agent_result",
    ) as unknown as RenderingTool;
    const rendered = (result: unknown) =>
      tool.renderResult(result, { expanded: false, isPartial: false }, theme).render(80).join("\n");
    expect(rendered(alpha)).toContain("alpha result");
    expect(rendered(beta)).toContain("beta result");

    const alphaRunning = await start("alpha_run", ["a2"]);
    const betaRunning = await start("beta_run", ["b2"]);
    const canceled = await harness.invoke("agent_cancel", { batchId: betaRunning });
    expect(text(canceled)).toContain("beta: stop requested");
    await vi.waitFor(() => expect(harness.child("b2").runtime.dispose).toHaveBeenCalled());
    expect(harness.child("a2").session.isStreaming).toBe(true);
    const stillRunning = await harness.invoke("agent_cancel", { batchId: alphaRunning });
    expect(text(stillRunning)).toContain("alpha: stop requested");
  });

  it("rejects unknown, off-branch, and other-session handles for every owner", async () => {
    const { harness } = await twoOwners();
    await expect(harness.invoke("agent_result", { batchId: "missing" })).rejects.toThrow(
      /Unknown or expired/,
    );
    await expect(harness.invoke("agent_cancel", { batchId: "missing" })).rejects.toThrow(
      /Unknown or expired/,
    );
    const batches = [await start("alpha_run", ["a1"]), await start("beta_run", ["b1"])];
    const launchLeaf = harness.manager.getLeafId();
    harness.manager.resetLeaf();
    for (const batchId of batches) {
      await expect(harness.invoke("agent_result", { batchId })).rejects.toThrow(/branch/);
      await expect(harness.invoke("agent_cancel", { batchId })).rejects.toThrow(/branch/);
    }
    harness.manager.branch(launchLeaf as string);
    await harness.replaceSession();
    for (const batchId of batches) {
      await expect(harness.invoke("agent_result", { batchId })).rejects.toThrow(/expired/);
      await expect(harness.invoke("agent_cancel", { batchId })).rejects.toThrow(/expired/);
    }
  });
});

describe("Completion Notice granularity", () => {
  it("sends one notice for a once-per-batch owner only after its last task is terminal", async () => {
    const { harness } = await twoOwners();
    await start("beta_run", ["b1", "b2"]);
    harness.child("b1").finish("First");
    await vi.waitFor(() =>
      expect(harness.registry.snapshot().runs.find((run) => run.taskId === "b1")?.status).toBe(
        "completed",
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.pi.messages).toHaveLength(0);
    harness.child("b2").finish("Second");
    await vi.waitFor(() => expect(harness.pi.messages).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.pi.messages).toEqual([
      expect.objectContaining({
        customType: "beta-notice",
        details: expect.objectContaining({ taskIds: ["b1", "b2"] }),
      }),
    ]);
  });

  it("keeps per-task notices for a per-task owner", async () => {
    const { harness } = await twoOwners();
    await start("alpha_run", ["a1", "a2"]);
    harness.child("a1").finish("First");
    await vi.waitFor(() => expect(harness.pi.messages).toHaveLength(1));
    expect(harness.pi.messages[0]).toMatchObject({
      customType: "alpha-notice",
      details: { taskIds: ["a1"] },
    });
  });
});

describe("collection tool activation", () => {
  it("follows owners that state whether they need the tools and keeps other active tools", async () => {
    let needed = false;
    let owner: { syncCollectionTools(): void } | undefined;
    harness = await ownerHarness(sdk, (pi) => {
      pi.setActiveTools(["read"]);
      createTestOwner(runtimeApi, {
        label: "gated",
        startTool: "gated_run",
        noticeType: "gated-notice",
        toolsNeeded: () => needed,
        onOwner: (access) => {
          owner = access;
        },
      })(pi);
    });
    expect(harness.pi.getActiveTools()).toEqual(["read"]);
    needed = true;
    owner?.syncCollectionTools();
    expect(harness.pi.getActiveTools()).toEqual(["read", "agent_result", "agent_cancel"]);
    needed = false;
    owner?.syncCollectionTools();
    expect(harness.pi.getActiveTools()).toEqual(["read"]);
  });

  it("keeps the tools active while another owner needs them", async () => {
    harness = await ownerHarness(sdk, (pi) => {
      createTestOwner(runtimeApi, {
        label: "gated",
        startTool: "gated_run",
        noticeType: "gated-notice",
        toolsNeeded: () => false,
      })(pi);
      createTestOwner(runtimeApi, {
        label: "always",
        startTool: "always_run",
        noticeType: "always-notice",
      })(pi);
    });
    expect(harness.pi.getActiveTools()).toEqual(["agent_result", "agent_cancel"]);
  });
});
