import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type {
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "../../src/ui/agents-overlay-data.ts";

const conversationView = {
  taskId: "inspect",
  profileId: "explore",
  entries: [
    { kind: "assistant" as const, text: "I found the caller." },
    { kind: "steering" as const, text: "Check the tests too." },
    {
      kind: "tool" as const,
      toolName: "read",
      status: "completed" as const,
      summary: "read src/index.ts",
    },
  ],
  omittedEntryCount: 2,
  omittedCharacterCount: 80,
  textTruncated: true,
  taskMetadata: { instructions: "Inspect the execution path" },
};

function data(overrides: Partial<AgentsOverlayData> = {}): AgentsOverlayData {
  return {
    runs: [
      {
        key: "active:inspect",
        active: true,
        taskId: "inspect",
        profileId: "explore",
        status: "running",
        modelId: "anthropic/claude-sonnet",
        thinkingLevel: "high",
        turns: 2,
        toolUses: 3,
        usage: {
          input: 100,
          output: 50,
          cacheRead: 25,
          cacheWrite: 0,
          totalTokens: 175,
          cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
        },
        recentActivity: ["read src/index.ts"],
        humanTruncated: true,
        modelTruncated: false,
        taskMetadata: conversationView.taskMetadata,
        sharedContext: "Repository context",
        conversationView,
      },
    ],
    profiles: [
      {
        id: "explore",
        description: "Read-only code exploration",
        source: "package",
        directory: "/profiles/explore",
        model: "openai/gpt-5",
        thinking: "high",
        tools: ["read", "code_find"],
        systemPrompt: "supi:explore",
        instructionScopes: [],
        fieldSources: {
          description: "package",
          tools: "package",
          systemPrompt: "package",
          instructionScopes: "package",
          model: "global",
          thinking: "project",
        },
      },
    ],
    diagnostics: [
      {
        profileId: "broken",
        source: "global",
        code: "invalid-manifest",
        message: "profile.json is invalid.",
        directory: "/profiles/broken",
      },
    ],
    omittedDiagnosticCount: 3,
    omittedProfileCount: 1,
    ...overrides,
  };
}

function dependencies(overrides: Partial<AgentsDialogDependencies> = {}): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    done: vi.fn(),
    tui: { requestRender: vi.fn() },
    onSteer: vi.fn(async () => "accepted" as const),
    onStop: vi.fn(async () => "accepted" as const),
    ...overrides,
  };
}

describe("AgentsDialog", () => {
  it("renders selected run metadata, usage, conversation, and disclosure notices", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    const text = dialog.render(100).join("\n");

    expect(text).toContain("inspect");
    expect(text).toContain("running");
    expect(text).toContain("anthropic/claude-sonnet");
    expect(text).toContain("thinking high");
    expect(text).toContain("175 tokens");
    expect(text).toContain("Instructions: Inspect the execution path");
    expect(text).toContain("Shared context: Repository context");
    expect(text).toContain("assistant: I found the caller.");
    expect(text).toContain("steering: Check the tests too.");
    expect(text).toContain("tool read (completed) — read src/index.ts");
    expect(text).toContain("2 conversation entries");
    expect(text).toContain("human output truncated");
  });

  it("renders the final result separately from the retained conversation", () => {
    const completed = data({
      runs: [
        {
          ...data().runs[0],
          key: "last:inspect",
          active: false,
          status: "completed",
          finalText: "The caller is in `src/index.ts`.",
        },
      ],
    });
    const dialog = new AgentsDialog(completed, dependencies());
    const text = dialog.render(100).join("\n");

    expect(text).toContain("Result");
    expect(text).toContain("The caller is in `src/index.ts`.");
  });

  it("shortens a long final result so the conversation remains visible", () => {
    const finalText = Array.from({ length: 30 }, (_, index) => `result line ${index + 1}`).join(
      "\n",
    );
    const completed = data({
      runs: [
        {
          ...data().runs[0],
          key: "last:inspect",
          active: false,
          status: "completed",
          finalText,
        },
      ],
    });
    const dialog = new AgentsDialog(completed, dependencies());
    const text = dialog.render(100).join("\n");

    expect(text).toContain("Result shortened for overlay");
    expect(text).toContain("result line 8");
    expect(text).not.toContain("result line 30");
    expect(text).toContain("Conversation");
    expect(text).toContain("assistant: I found the caller.");
  });

  it("does not report a trailing newline as truncated output", () => {
    const finalText = Array.from({ length: 8 }, (_, index) => `result line ${index + 1}`).join(
      "\n",
    );
    const completed = data({
      runs: [
        {
          ...data().runs[0],
          key: "last:inspect",
          active: false,
          status: "completed",
          finalText: `${finalText}\n`,
        },
      ],
    });
    const dialog = new AgentsDialog(completed, dependencies());

    expect(dialog.render(100).join("\n")).not.toContain("Result shortened for overlay");
  });

  it("does not render a result section for a failed task", () => {
    const failed = data({
      runs: [
        {
          ...data().runs[0],
          key: "last:inspect",
          active: false,
          status: "failed",
          failureCode: "prompt-rejected",
          finalText: "",
        },
      ],
    });
    const dialog = new AgentsDialog(failed, dependencies());
    const text = dialog.render(100).join("\n");

    expect(text).toContain("failed (prompt-rejected)");
    expect(text).not.toContain("Result");
  });

  it("shows effective profile provenance and bounded diagnostics on their tabs", () => {
    const dialog = new AgentsDialog(data(), dependencies());

    dialog.handleInput("\t");
    const profiles = dialog.render(100).join("\n");
    expect(profiles).toContain("Runs 1");
    expect(profiles).toContain("Profiles 1");
    expect(profiles).toContain("Diagnostics 1");
    expect(profiles).toContain("Read-only code exploration");
    expect(profiles).toContain("Strongest source: package — /profiles/explore");
    expect(profiles).toContain("Model (global): openai/gpt-5");
    expect(profiles).toContain("Thinking (project): high");
    expect(profiles).toContain("Tools (package): read, code_find");
    expect(profiles).toContain("1 additional profile omitted");

    dialog.handleInput("\t");
    const diagnostics = dialog.render(100).join("\n");
    expect(diagnostics).toContain("invalid-manifest");
    expect(diagnostics).toContain("profile.json is invalid.");
    expect(diagnostics).toContain("3 additional diagnostics omitted");
  });

  it("resets conversation paging when a live update replaces the selected run", () => {
    const entries = Array.from({ length: 15 }, (_, index) => ({
      kind: "assistant" as const,
      text: `message ${index + 1}`,
    }));
    const initial = data({
      runs: [
        {
          ...data().runs[0],
          conversationView: { ...conversationView, entries },
        },
      ],
    });
    const dialog = new AgentsDialog(initial, dependencies());
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(100).join("\n")).not.toContain("message 15");

    dialog.updateData({
      ...initial,
      runs: [{ ...initial.runs[0], key: "last:inspect", active: false }],
    });

    expect(dialog.render(100).join("\n")).toContain("message 15");
  });

  it("reports control failures without an unhandled rejection", async () => {
    const onSteer = vi.fn(async () => {
      throw new Error("TUI closed");
    });
    const dialog = new AgentsDialog(data(), dependencies({ onSteer }));

    dialog.handleInput("s");

    await vi.waitFor(() => expect(dialog.render(100).join("\n")).toContain("Control failed"));
  });

  it("steers and stops only the selected active run", async () => {
    const onSteer = vi.fn(async () => "accepted" as const);
    const onStop = vi.fn(async () => "accepted" as const);
    const dialog = new AgentsDialog(data(), dependencies({ onSteer, onStop }));

    dialog.handleInput("s");
    await vi.waitFor(() => expect(dialog.render(100).join("\n")).toContain("Control accepted"));
    expect(onSteer).toHaveBeenCalledWith("inspect");
    dialog.handleInput("x");
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith("inspect"));
  });

  it("permits selected stop during startup and shows the stopping wait", async () => {
    const onStop = vi.fn(async () => "accepted" as const);
    const starting = data({
      runs: [{ ...data().runs[0], status: "starting" }],
    });
    const dialog = new AgentsDialog(starting, dependencies({ onStop }));

    dialog.handleInput("x");

    expect(dialog.render(100).join("\n")).toContain("Stopping selected run");
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith("inspect"));
  });

  it("renders every lifecycle status distinctly", () => {
    const statuses = [
      "starting",
      "running",
      "stopping",
      "completed",
      "failed",
      "canceled",
      "timeout",
    ] as const;
    const runs = statuses.map((status) => ({
      ...data().runs[0],
      key: status,
      taskId: status,
      active: status === "starting" || status === "running" || status === "stopping",
      status,
    }));
    const text = new AgentsDialog(data({ runs }), dependencies()).render(120).join("\n");

    for (const status of statuses) expect(text).toContain(status);
  });

  it("disables controls for a completed run", () => {
    const onSteer = vi.fn(async () => "accepted" as const);
    const onStop = vi.fn(async () => "accepted" as const);
    const completed = data({
      runs: [{ ...data().runs[0], key: "last:inspect", active: false, status: "completed" }],
    });
    const dialog = new AgentsDialog(completed, dependencies({ onSteer, onStop }));

    dialog.handleInput("s");
    dialog.handleInput("x");

    expect(onSteer).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(dialog.render(100).join("\n")).toContain("controls unavailable");
  });

  it("keeps every rendered line within the available width", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    expect(dialog.render(60).every((line) => line.length <= 60)).toBe(true);
  });
});
