import agentExtension from "@mrclrchtr/supi-agent/extension";
import { getAgentRunRegistry } from "@mrclrchtr/supi-agent-runtime/api";
import { type SettingsModule, SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import type { BackgroundHarness } from "@mrclrchtr/supi-test-utils/background";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finding,
  reviewHarness,
  submitReview,
  task,
  waitForReviewers,
} from "../helpers/background-review.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));

vi.setConfig({ testTimeout: 30_000 });

let harness: BackgroundHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const STATUS_KEY = "supi-review-background";

/** The text of the Background Review status line; empty once it is cleared. */
function statusLine(current: BackgroundHarness): string {
  const calls = vi
    .mocked(current.ctx.ui.setStatus)
    .mock.calls.filter(([key]) => key === STATUS_KEY);
  return (calls.at(-1)?.[1] as string | undefined) ?? "";
}

async function startReview(current: BackgroundHarness, ids: string[]) {
  const started = await current.invoke("review_run", {
    mode: "background",
    tasks: ids.map((id) => task(id)),
  });
  return (started.details as { batchId: string }).batchId;
}

const collectionTools = (current: BackgroundHarness) =>
  current.pi.getActiveTools().filter((name) => name === "agent_result" || name === "agent_cancel");

function reviewSettings(current: BackgroundHarness): SettingsModule {
  const modules: SettingsModule[] = [];
  current.pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, {
    add: (module: SettingsModule) => modules.push(module),
  });
  const review = modules.find((module) => module.id === "review");
  if (!review) throw new Error("Missing Review settings.");
  return review;
}

describe("a running Background Review", () => {
  it("shows one status line that counts finished tasks across Reviews and clears at the end", async () => {
    harness = await reviewHarness(sdk);
    const current = harness;
    const emitted = vi.mocked(current.pi.events.emit);
    await startReview(current, ["alpha", "beta"]);
    await waitForReviewers(current, 2);
    expect(statusLine(current)).toContain("Background Review");
    expect(statusLine(current)).toContain("0 of 2 tasks finished");
    // The session is free while the Review runs: no working indicator stays open.
    const working = (name: string) =>
      emitted.mock.calls.filter(([channel]) => channel === name).length;
    expect(working("supi:working:start")).toBe(working("supi:working:end"));

    await submitReview(sdk, current, "alpha");
    await vi.waitFor(() => expect(statusLine(current)).toContain("1 of 2 tasks finished"));

    await startReview(current, ["gamma"]);
    await waitForReviewers(current, 2);
    // The spinner renders a changed label on its next frame.
    await vi.waitFor(() => expect(statusLine(current)).toContain("2 Background Reviews"));
    expect(statusLine(current)).toContain("1 of 3 tasks finished");

    await submitReview(sdk, current, "beta");
    await vi.waitFor(() => expect(statusLine(current)).not.toContain("2 Background Reviews"));
    expect(statusLine(current)).toContain("0 of 1 tasks finished");

    await submitReview(sdk, current, "gamma");
    await vi.waitFor(() => expect(statusLine(current)).toBe(""));
  });

  it("clears the status line when the last active Review is stopped", async () => {
    harness = await reviewHarness(sdk);
    const current = harness;
    const batchId = await startReview(current, ["alpha"]);
    await waitForReviewers(current, 1);
    expect(statusLine(current)).toContain("0 of 1 tasks finished");
    await current.invoke("agent_cancel", { batchId });
    await vi.waitFor(() => expect(statusLine(current)).toBe(""));
  });

  it("marks terminal Reviewer Usage as uncollected in /agents until the first stored collection", async () => {
    harness = await reviewHarness(sdk);
    const current = harness;
    const batchId = await startReview(current, ["alpha", "beta"]);
    await waitForReviewers(current, 2);
    const registry = getAgentRunRegistry(current.pi as never);
    const alpha = () =>
      registry.snapshot().runs.find((run) => run.batchId === batchId && run.taskId === "alpha")
        ?.result?.display;

    await submitReview(sdk, current, "alpha", [finding]);
    await vi.waitFor(() => expect(alpha()?.usageStatus).toBe("uncollected"));
    // The Reviewer's own display details survive the Usage marker.
    expect(alpha()).toMatchObject({ verdict: "issues", findingCount: 1 });

    await current.invoke("agent_result", { batchId });
    expect(alpha()?.usageStatus).toBe("reported");
    expect(alpha()).toMatchObject({ verdict: "issues" });
  });
});

describe("collection tool availability", () => {
  it("deactivates agent_result and agent_cancel with Review's Agent tools off and no Agent extension", async () => {
    harness = await reviewHarness(sdk, { agentToolEnabled: false });
    const current = harness;
    expect(collectionTools(current)).toEqual([]);
    expect(current.pi.getActiveTools()).not.toContain("review_run");

    await reviewSettings(current).apply({
      scope: "project",
      cwd: current.ctx.cwd,
      fieldKey: "agentToolEnabled",
      action: { kind: "set", value: "on" },
    });
    expect(current.pi.getActiveTools()).toContain("review_run");
    expect(collectionTools(current).sort()).toEqual(["agent_cancel", "agent_result"]);

    await reviewSettings(current).apply({
      scope: "project",
      cwd: current.ctx.cwd,
      fieldKey: "agentToolEnabled",
      action: { kind: "set", value: "off" },
    });
    expect(collectionTools(current)).toEqual([]);
  });

  it("keeps the collection tools active for delegation when the Agent extension is loaded", async () => {
    harness = await reviewHarness(
      sdk,
      { agentToolEnabled: false },
      { extensions: [agentExtension] },
    );
    const current = harness;
    expect(collectionTools(current).sort()).toEqual(["agent_cancel", "agent_result"]);
  });
});
