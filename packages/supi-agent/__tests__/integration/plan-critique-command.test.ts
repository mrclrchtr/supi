import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTheme } from "@earendil-works/pi-coding-agent";
import type {
  AgentRunOutcome,
  StartRegisteredAgentRunOptions,
} from "@mrclrchtr/supi-agent-runtime/api";
import { createPiMock, makeCtx } from "@mrclrchtr/supi-test-utils";
import { testModelContext } from "@mrclrchtr/supi-test-utils/background";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAN_CRITIQUE_COMMAND,
  registerPlanCritiqueCommand,
} from "../../src/plan-critique/command.ts";

type ScriptedRun = (
  options: StartRegisteredAgentRunOptions<string>,
) => Promise<AgentRunOutcome<string | undefined>>;

const run = vi.hoisted(() => ({
  calls: [] as StartRegisteredAgentRunOptions<string>[],
  script: undefined as ScriptedRun | undefined,
}));

vi.mock("@mrclrchtr/supi-agent-runtime/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@mrclrchtr/supi-agent-runtime/api")>();
  return {
    ...original,
    startRegisteredAgentRun: (options: StartRegisteredAgentRunOptions<string>) => {
      run.calls.push(options);
      const taskResult = (run.script ?? success("Looks fine."))(options);
      return {
        runKey: options.registration.metadata.runKey ?? "run",
        steeringAvailable: false,
        taskResult,
        result: taskResult,
        subscribe: () => () => undefined,
        steer: async () => "not-running" as const,
        stop: async () => undefined,
      };
    },
  };
});

const diagnostics = { lifecycle: [], omittedLifecycleCount: 0 } as never;

function success(text: string | undefined): ScriptedRun {
  return async () => ({ kind: "success", value: text as string });
}

function assistant(
  content: Array<{ type: "text"; text: string } | { type: "toolCall"; id: string }>,
  stopReason = "stop",
) {
  return { type: "message", message: { role: "assistant", content, stopReason } };
}

const loaders: Array<{ handleInput: (data: string) => void; dispose?: () => void }> = [];
let root: string;
let agentDir: string;
let cwd: string;

beforeAll(() => initTheme("dark"));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "plan-critique-"));
  agentDir = join(root, "agent");
  cwd = join(root, "repo");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(join(cwd, ".git"), { recursive: true });
  writeFileSync(join(agentDir, "AGENTS.md"), "global rules");
  writeFileSync(join(cwd, "AGENTS.md"), "project rules");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  run.calls.length = 0;
  run.script = undefined;
});

afterEach(() => {
  for (const loader of loaders.splice(0)) loader.dispose?.();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

interface Setup {
  branch?: unknown[];
  mode?: "tui" | "rpc" | "json" | "print";
  idle?: () => boolean;
  model?: unknown;
  draft?: string;
}

/** Invoke the captured command handler with a TUI loader that runs its operation. */
async function invoke(setup: Setup = {}) {
  const pi = createPiMock();
  registerPlanCritiqueCommand(pi as never);
  const working: string[] = [];
  pi.events.on("supi:working:start", () => working.push("start"));
  pi.events.on("supi:working:end", () => working.push("end"));
  const sendUserMessage = vi.fn();
  Object.assign(pi, { sendUserMessage });

  const base = testModelContext() as unknown as Record<string, unknown>;
  const ui = makeCtx().ui;
  ui.getEditorText = vi.fn(() => setup.draft ?? "");
  const custom = vi.fn(
    (
      factory: (tui: unknown, theme: unknown, keys: unknown, done: (v: unknown) => void) => unknown,
    ) =>
      new Promise((resolve) => {
        loaders.push(
          factory({ requestRender: vi.fn() }, ui.theme, {}, resolve) as {
            handleInput: (data: string) => void;
          },
        );
      }),
  );
  const ctx = {
    ...base,
    cwd,
    mode: setup.mode ?? "tui",
    hasUI: setup.mode !== "print" && setup.mode !== "json",
    isIdle: setup.idle ?? (() => true),
    isProjectTrusted: () => true,
    ...(setup.model === undefined ? {} : { model: setup.model }),
    sessionManager: {
      getBranch: () => setup.branch ?? [assistant([{ type: "text", text: "The plan." }])],
    },
    modelRegistry: {
      ...(base.modelRegistry as object),
      getProvider: vi.fn(),
      getProviderAuth: vi.fn(),
      getApiKeyAndHeaders: vi.fn(),
    },
    ui: { ...ui, custom },
  };
  const command = pi.commands.get(PLAN_CRITIQUE_COMMAND) as {
    handler: (args: string, ctx: unknown) => Promise<void>;
  };
  await command.handler("", ctx);
  return { notify: ui.notify, sendUserMessage, setEditorText: ui.setEditorText, working };
}

describe("/supi-plan-critique", () => {
  it.each([
    {
      name: "outside the TUI",
      setup: { mode: "rpc" as const },
      text: "only in the interactive TUI",
    },
    { name: "while the agent runs", setup: { idle: () => false }, text: "Wait until the agent" },
    {
      name: "when the last answer has no text",
      setup: { branch: [assistant([{ type: "toolCall", id: "1" }])] },
      text: "has no text",
    },
    { name: "without an answer", setup: { branch: [] }, text: "no agent answer" },
    {
      name: "when the last answer is incomplete",
      setup: { branch: [assistant([{ type: "text", text: "Half a pl" }], "aborted")] },
      text: "incomplete",
    },
  ])("refuses $name without starting a run", async ({ setup, text }) => {
    const result = await invoke(setup);

    expect(run.calls).toHaveLength(0);
    expect(result.sendUserMessage).not.toHaveBeenCalled();
    expect(result.notify).toHaveBeenCalledWith(expect.stringContaining(text), "warning");
    expect(result.working).toEqual([]);
  });

  it("passes the last answer on the active branch verbatim and runs the fixed policy", async () => {
    const plan = "## Plan\n\n1. Change `a.ts`.\n";
    await invoke({
      branch: [
        assistant([{ type: "text", text: "An older answer." }]),
        { type: "message", message: { role: "user", content: "Plan it." } },
        assistant([
          { type: "text", text: plan },
          { type: "toolCall", id: "1" },
          { type: "text", text: "Open question?" },
        ]),
      ],
    });

    expect(run.calls).toHaveLength(1);
    const options = run.calls[0];
    expect(options?.prompt).toContain(`<plan>\n${plan}Open question?\n</plan>`);
    expect(options?.prompt).not.toContain("An older answer.");
    expect(options?.inputs.cwd).toBe(cwd);
    expect(options?.inputs.tools).toEqual([
      "read",
      "grep",
      "find",
      "ls",
      "bash",
      "code_resolve",
      "code_inspect",
      "code_orientation",
      "code_graph",
      "code_find",
      "code_health",
    ]);
    expect(options?.inputs.model).toMatchObject({ provider: "test", id: "model" });
    expect(options?.inputs.thinkingLevel).toBe("off");
    expect(options?.registration.metadata).toMatchObject({ kind: "Plan Critic", cwd });

    await options?.inputs.resourceLoader?.reload();
    const loader = options?.inputs.resourceLoader;
    expect(loader?.getSystemPrompt()).toContain("You are a Plan Critic.");
    expect(loader?.getSystemPrompt()).toContain("Change nothing.");
    expect(loader?.getSystemPrompt()).toContain("what you did not verify");
    expect(loader?.getAgentsFiles().agentsFiles.map((file) => file.content)).toEqual([
      "global rules",
      "project rules",
    ]);
    expect(loader?.getSkills().skills).toEqual([]);
  });

  it("sends the closing message inside the fixed frame and pairs the working events", async () => {
    run.script = success("  Finding: `a.ts` does not exist.  ");

    const result = await invoke();

    expect(result.sendUserMessage).toHaveBeenCalledOnce();
    const message = result.sendUserMessage.mock.calls[0]?.[0] as string;
    expect(message).toContain("<plan_critique>\nFinding: `a.ts` does not exist.\n</plan_critique>");
    expect(message).toContain("Verify every point of the critique yourself");
    expect(message).toContain("revise the plan");
    expect(message).toContain("Implement nothing");
    expect(result.working).toEqual(["start", "end"]);
  });

  it.each([
    {
      name: "failure",
      script: (async () => ({
        kind: "failed",
        failureCode: "provider-error",
        diagnostics,
      })) as ScriptedRun,
      text: "failed (provider-error)",
      level: "error",
    },
    {
      name: "cancellation",
      script: (async () => ({ kind: "canceled", diagnostics })) as ScriptedRun,
      text: "canceled",
      level: "info",
    },
    {
      name: "an empty closing message",
      script: success("  \n"),
      text: "without a closing message",
      level: "error",
    },
    {
      name: "a rejected run",
      script: (async () => {
        throw new Error("runner exploded");
      }) as ScriptedRun,
      text: "runner exploded",
      level: "error",
    },
  ])(
    "sends nothing after $name and still ends the working state",
    async ({ script, text, level }) => {
      run.script = script;

      const result = await invoke();

      expect(result.sendUserMessage).not.toHaveBeenCalled();
      expect(result.setEditorText).not.toHaveBeenCalled();
      expect(result.notify).toHaveBeenCalledWith(expect.stringContaining(text), level);
      expect(result.working).toEqual(["start", "end"]);
    },
  );

  it("cancels the run with Escape on the loader", async () => {
    run.script = (options) =>
      new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve({ kind: "canceled", diagnostics }));
        queueMicrotask(() => loaders.at(-1)?.handleInput("\x1b"));
      });

    const result = await invoke();

    expect(run.calls[0]?.signal?.aborted).toBe(true);
    expect(result.sendUserMessage).not.toHaveBeenCalled();
    expect(result.notify).toHaveBeenCalledWith(expect.stringContaining("canceled"), "info");
    expect(result.working).toEqual(["start", "end"]);
  });

  it("puts the framed critique into the editor when the agent became busy", async () => {
    let checks = 0;
    const result = await invoke({ idle: () => checks++ === 0 });

    expect(result.sendUserMessage).not.toHaveBeenCalled();
    expect(result.setEditorText).toHaveBeenCalledWith(expect.stringContaining("<plan_critique>"));
    expect(result.notify).toHaveBeenCalledWith(expect.stringContaining("became busy"), "warning");
    expect(result.working).toEqual(["start", "end"]);
  });

  it("keeps a draft the user typed when the critique goes to the editor", async () => {
    let checks = 0;
    const result = await invoke({ idle: () => checks++ === 0, draft: "my draft" });

    expect(result.setEditorText).toHaveBeenCalledWith(
      expect.stringMatching(/^my draft\n\nAn independent Plan Critic/),
    );
    expect(result.notify).toHaveBeenCalledWith(
      expect.stringContaining("after your draft"),
      "warning",
    );
  });

  it("stops before a run when the session has no model", async () => {
    const result = await invoke({ model: null });

    expect(run.calls).toHaveLength(0);
    expect(result.notify).toHaveBeenCalledWith(expect.stringContaining("no active model"), "error");
    expect(result.working).toEqual([]);
  });
});
