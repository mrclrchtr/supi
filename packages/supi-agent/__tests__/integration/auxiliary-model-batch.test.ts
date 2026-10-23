import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backgroundHarness } from "../helpers/background-harness.ts";
import { writeProfile } from "../helpers/profile-fixtures.ts";

const sdk = vi.hoisted(() => ({ createAgentSession: vi.fn(), createAgentSessionRuntime: vi.fn() }));
const runtimeCalls = vi.hoisted(() => ({ capture: vi.fn(), start: vi.fn() }));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  ...sdk,
}));
vi.mock("@mrclrchtr/supi-agent-runtime/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@mrclrchtr/supi-agent-runtime/api")>();
  return {
    ...original,
    captureAgentRunAuxiliaryModels: (
      ...args: Parameters<typeof original.captureAgentRunAuxiliaryModels>
    ) => {
      runtimeCalls.capture(...args);
      return original.captureAgentRunAuxiliaryModels(...args);
    },
    startRegisteredAgentRun: (...args: Parameters<typeof original.startRegisteredAgentRun>) => {
      runtimeCalls.start(...args);
      return original.startRegisteredAgentRun(...args);
    },
  };
});

let harness: Awaited<ReturnType<typeof backgroundHarness>> | undefined;
let releasePendingCatalogues: Array<() => void> = [];
afterEach(async () => {
  for (const release of releasePendingCatalogues) release();
  releasePendingCatalogues = [];
  await harness?.close();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Agent Run auxiliary-model batch policy", () => {
  it("cancels pending catalogue startup, releases admission, and discards late results", async () => {
    harness = await backgroundHarness(sdk);
    const profiles = join(harness.agentDir, "supi", "agents");
    await writeProfile(profiles, "explore", { tools: ["read", "codemode"] });
    await harness.pi.emit(
      "session_start",
      { type: "session_start", reason: "reload" },
      harness.ctx,
    );
    await mkdir(join(harness.ctx.cwd, ".pi/supi"), { recursive: true });
    await writeFile(
      join(harness.ctx.cwd, ".pi/supi/config.json"),
      JSON.stringify({ agent: { maxConcurrentRuns: 1 } }),
    );

    const catalogue = deferred<never[]>();
    releasePendingCatalogues.push(() => catalogue.resolve([]));
    Object.assign(harness.ctx.modelRegistry, {
      getAvailableOfType: vi.fn(() => catalogue.promise),
    });
    const firstParent = await harness.beginParent();
    const first = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "first", new: { profile: "explore" }, instructions: "Inspect." }],
    });
    const firstOutcome = first.then(
      () => "resolved",
      () => "rejected",
    );
    await vi.waitFor(() => expect(runtimeCalls.capture).toHaveBeenCalledTimes(1));

    firstParent.abort();
    await expect(Promise.race([firstOutcome, timeout(250)])).resolves.toBe("rejected");
    await harness.endParent(true);

    const secondParent = await harness.beginParent();
    const second = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "second", new: { profile: "explore" }, instructions: "Inspect." }],
    });
    const secondOutcome = second.then(
      () => "resolved",
      () => "rejected",
    );
    await vi.waitFor(() => expect(runtimeCalls.capture).toHaveBeenCalledTimes(2));
    secondParent.abort();
    await expect(Promise.race([secondOutcome, timeout(250)])).resolves.toBe("rejected");
    await harness.endParent(true);

    catalogue.resolve([]);
    await vi.waitFor(() => expect(harness?.children).toHaveLength(0));
  });

  it("stops existing children immediately but awaits uncancelable discovery during shutdown", async () => {
    harness = await backgroundHarness(sdk);
    const profiles = join(harness.agentDir, "supi", "agents");
    await writeProfile(profiles, "explore", { tools: ["read", "codemode"] });
    await harness.pi.emit(
      "session_start",
      { type: "session_start", reason: "reload" },
      harness.ctx,
    );

    const catalogue = deferred<never[]>();
    releasePendingCatalogues.push(() => catalogue.resolve([]));
    Object.assign(harness.ctx.modelRegistry, {
      getAvailableOfType: vi.fn(() => catalogue.promise),
    });
    const active = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "active", new: { profile: "general" }, instructions: "Inspect." }],
    });
    const activeOutcome = active.catch(() => undefined);
    await waitForChildren(1);

    const invocation = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [{ id: "pending", new: { profile: "explore" }, instructions: "Inspect." }],
    });
    const invocationOutcome = invocation.then(
      () => "resolved",
      () => "rejected",
    );
    await vi.waitFor(() => expect(runtimeCalls.capture).toHaveBeenCalledTimes(1));

    let shutdownSettled = false;
    const shutdown = harness.pi
      .emit("session_shutdown", { type: "session_shutdown" }, harness.ctx)
      .then(() => {
        shutdownSettled = true;
      });
    await expect(Promise.race([invocationOutcome, timeout(250)])).resolves.toBe("rejected");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shutdownSettled).toBe(false);
    expect(harness.children[0]?.session.abort).toHaveBeenCalled();

    catalogue.resolve([]);
    await shutdown;
    await activeOutcome;
    expect(harness.children).toHaveLength(1);
  });

  it("shares a snapshot only with opted-in siblings and refreshes it on continuation", async () => {
    harness = await backgroundHarness(sdk);
    const profiles = join(harness.agentDir, "supi", "agents");
    await writeProfile(profiles, "explore", { tools: ["read", "codemode"] });
    await writeProfile(profiles, "plain", {
      description: "Read-only profile",
      tools: ["read"],
      systemPrompt: "native",
      instructionScopes: [],
    });
    await harness.pi.emit(
      "session_start",
      { type: "session_start", reason: "reload" },
      harness.ctx,
    );

    const batch = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        { id: "codemode-one", new: { profile: "explore" }, instructions: "Inspect one." },
        { id: "codemode-two", new: { profile: "explore" }, instructions: "Inspect two." },
        { id: "plain", new: { profile: "plain" }, instructions: "Inspect plain." },
      ],
    });
    await waitForChildren(3);

    expect(runtimeCalls.capture).toHaveBeenCalledTimes(1);
    const firstInputs = readStartedInputs(3);
    const firstSnapshot = firstInputs[0]?.authorizedAuxiliaryModels;
    expect(firstSnapshot).toBeDefined();
    expect(firstInputs[1]?.authorizedAuxiliaryModels).toBe(firstSnapshot);
    expect(firstInputs[2]).not.toHaveProperty("authorizedAuxiliaryModels");
    expect(firstInputs[0]?.tools).toEqual(["read", "codemode"]);
    expect(firstInputs[2]?.tools).toEqual(["read"]);

    for (const child of harness.children.slice(0, 3)) child.finish("Task complete.");
    const result = await batch;
    const conversationId = (result.details as { tasks: Array<{ conversationId: string }> }).tasks[0]
      ?.conversationId;
    if (!conversationId) throw new Error("Missing saved conversation reference.");

    const followUp = harness.invoke("agent_run", {
      mode: "foreground",
      tasks: [
        {
          id: "codemode-follow-up",
          continue: { conversationId },
          instructions: "Check the current state.",
        },
      ],
    });
    await waitForChildren(4);
    expect(runtimeCalls.capture).toHaveBeenCalledTimes(2);
    const followUpInput = readStartedInputs(4)[3];
    expect(followUpInput?.authorizedAuxiliaryModels).toBeDefined();
    expect(followUpInput?.authorizedAuxiliaryModels).not.toBe(firstSnapshot);
    harness.children[3]?.finish("Current state checked.");
    await followUp;
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function timeout(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
}

function readStartedInputs(count: number): Array<{
  readonly tools: readonly string[];
  readonly authorizedAuxiliaryModels?: object;
}> {
  return runtimeCalls.start.mock.calls.slice(0, count).map(([options]) => {
    if (!options || typeof options !== "object" || !("inputs" in options)) {
      throw new Error("Missing Agent Run session inputs.");
    }
    return options.inputs as {
      readonly tools: readonly string[];
      readonly authorizedAuxiliaryModels?: object;
    };
  });
}

async function waitForChildren(count: number): Promise<void> {
  await vi.waitFor(() => expect(harness?.children).toHaveLength(count));
}
