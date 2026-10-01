import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import { makeCtx } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import { AgentsDialog } from "../../src/ui/agents-overlay.ts";
import type {
  AgentsDialogDependencies,
  AgentsOverlayData,
} from "../../src/ui/agents-overlay-data.ts";
import { makeAgentsRun } from "../helpers/agents-viewer-fixtures.ts";

const conversation = {
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
};

function data(overrides: Partial<AgentsOverlayData> = {}): AgentsOverlayData {
  return {
    runs: [
      makeAgentsRun({
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
        result: { humanTruncated: true },
        taskDescription: "Inspect the execution path",
        sharedContext: "Repository context",
        conversation,
      }),
    ],
    profilePages: {
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
    },
    ...overrides,
  };
}

function openConversation(dialog: AgentsDialog): void {
  dialog.handleInput("\n");
}

function showDetails(dialog: AgentsDialog): void {
  dialog.handleInput("\t");
}

function dependencies(overrides: Partial<AgentsDialogDependencies> = {}): AgentsDialogDependencies {
  return {
    theme: makeCtx().ui.theme as never,
    done: vi.fn(),
    tui: { requestRender: vi.fn(), terminal: { rows: 24 } },
    onSteer: vi.fn(async () => "queued" as const),
    onStop: vi.fn(async () => "accepted" as const),
    ...overrides,
  };
}

describe("AgentsDialog", () => {
  it("shows a searchable Agent list before it opens a conversation", () => {
    const run = makeAgentsRun({
      taskId: "inspect-router",
      label: "explore",
      turns: 8,
      toolUses: 12,
      recentActivity: ["read src/router.ts"],
      startedAt: Date.now() - 5_000,
      conversation,
    });
    const dialog = new AgentsDialog(data({ runs: [run] }), dependencies());
    const text = dialog.render(100).join("\n");

    expect(text).toContain("inspect-router");
    expect(text).toContain("running");
    expect(text).toContain("read src/router.ts");
    expect(text).toContain("Search");
    expect(text).not.toContain("I found the caller.");
    expect(text).not.toContain("8 turns");
    expect(text).not.toContain("12 tools");
    expect(text).not.toContain("controls unavailable");
  });

  it("filters tasks by searchable text", () => {
    const dialog = new AgentsDialog(
      data({
        runs: [
          makeAgentsRun({ taskId: "find-router", label: "inspect" }),
          makeAgentsRun({ key: "run:other", taskId: "check-tests", label: "test" }),
        ],
      }),
      dependencies(),
    );
    for (const character of "router") dialog.handleInput(character);
    const filtered = dialog.render(100).join("\n");
    expect(filtered).toContain("find-router");
    expect(filtered).not.toContain("check-tests");
    dialog.handleInput("x");
    expect(dialog.render(100).join("\n")).toContain("No tasks match “routerx”.");
  });

  it("keeps runs from one batch together in the searchable list", () => {
    const runs = [
      makeAgentsRun({
        taskId: "old-first",
        batchId: "batch-old",
        startedAt: Date.now() - 10_000,
      }),
      makeAgentsRun({
        key: "run:new",
        taskId: "new-batch",
        batchId: "batch-new",
        startedAt: Date.now() - 5_000,
      }),
      makeAgentsRun({
        key: "run:old-second",
        taskId: "old-second",
        batchId: "batch-old",
        startedAt: Date.now() - 9_000,
      }),
    ];
    const text = new AgentsDialog(data({ runs }), dependencies()).render(120).join("\n");
    const newest = text.indexOf("new-batch");
    const firstOld = text.indexOf("old-first");
    const secondOld = text.indexOf("old-second");
    expect(newest).toBeLessThan(firstOld);
    expect(firstOld).toBeLessThan(secondOld);
    expect(text).toContain("batch batch-ol");
  });

  it("uses configured Pi keys to open, return, and close the conversation", () => {
    const done = vi.fn();
    const keybindings = {
      matches: (data: string, action: string) =>
        (data === "go" && action === "tui.select.confirm") ||
        (data === "back" && action === "app.interrupt"),
      getKeys: (action: string) => (action === "app.tools.expand" ? ["ctrl+shift+o"] : []),
    } as never;
    const dialog = new AgentsDialog(data(), dependencies({ done, keybindings }));

    dialog.handleInput("go");
    expect(dialog.render(100).join("\n")).toContain("I found the caller.");
    expect(dialog.render(100).join("\n")).toContain("ctrl+shift+o");
    dialog.handleInput("back");
    expect(dialog.render(100).join("\n")).not.toContain("I found the caller.");
    dialog.handleInput("back");
    expect(done).toHaveBeenCalledOnce();
  });

  it("shows review target, verdict, and findings without replacing execution status", () => {
    const review = makeAgentsRun({
      key: "review:task",
      runKey: "review-task",
      taskId: "audit-paths",
      kind: "Reviewer",
      label: "change review",
      active: false,
      status: "completed",
      display: { target: "Filesystem changes" },
      result: {
        finalText: "The path check misses a traversal case.",
        display: {
          target: "Filesystem changes",
          verdict: "issues",
          findingCount: 2,
          blockingFindingCount: 1,
        },
      },
    });
    const dialog = new AgentsDialog(data({ runs: [review] }), dependencies());
    dialog.handleInput("\t");
    const text = dialog.render(140).join("\n");
    expect(text).toContain("completed");
    expect(text).toContain("Filesystem changes");
    expect(text).toContain("verdict issues");
    expect(text).toContain("2 findings");
    expect(text).toContain("Result: The path check misses a traversal case.");
  });

  it("opens a full-width conversation and returns to the list before it closes", () => {
    const done = vi.fn();
    const dialog = new AgentsDialog(data(), dependencies({ done }));
    dialog.handleInput("\n");
    const conversationText = dialog.render(100).join("\n");

    expect(conversationText).toContain("I found the caller.");
    expect(conversationText).not.toContain("No Agent Runs.");
    dialog.handleInput("\u001b");
    expect(dialog.render(100).join("\n")).not.toContain("I found the caller.");
    expect(done).not.toHaveBeenCalled();
    dialog.handleInput("\u001b");
    expect(done).toHaveBeenCalledOnce();
  });

  it("filters between Agent and Reviewer lists", () => {
    const dialog = new AgentsDialog(
      data({
        runs: [
          makeAgentsRun({ taskId: "agent-task", kind: "Agent Run" }),
          makeAgentsRun({
            key: "review:task",
            runKey: "review-task",
            taskId: "review-task",
            kind: "Reviewer",
            label: "change review",
          }),
        ],
      }),
      dependencies(),
    );
    expect(dialog.render(100).join("\n")).toContain("agent-task");
    expect(dialog.render(100).join("\n")).not.toContain("review-task");

    dialog.handleInput("\t");
    const reviews = dialog.render(100).join("\n");
    expect(reviews).toContain("review-task");
    expect(reviews).not.toContain("agent-task");
  });

  it("keeps the run list in sync after an arrow changes a catalogue tab", () => {
    const dialog = new AgentsDialog(
      data({
        runs: [
          makeAgentsRun({ taskId: "agent-task", kind: "Agent Run" }),
          makeAgentsRun({
            key: "review:task",
            runKey: "review-task",
            taskId: "review-task",
            kind: "Reviewer",
            label: "change review",
          }),
        ],
      }),
      dependencies(),
    );
    dialog.handleInput("\t");
    dialog.handleInput("\t");
    expect(dialog.render(100).join("\n")).toContain("[Profiles]");

    dialog.handleInput("\u001b[D");
    const reviews = dialog.render(100).join("\n");
    expect(reviews).toContain("[Reviews]");
    expect(reviews).toContain("review-task");
    expect(reviews).not.toContain("agent-task");
  });

  it("keeps the default conversation clean and shows run metadata in Details", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    openConversation(dialog);
    const conversationText = dialog.render(100).join("\n");
    expect(conversationText).toContain("I found the caller.");
    expect(conversationText).not.toContain("assistant:");
    expect(conversationText).not.toContain("Task: Inspect the execution path");
    showDetails(dialog);
    const details = dialog.render(100).join("\n");
    expect(details).toContain("anthropic/claude-sonnet");
    expect(details).toContain("thinking high");
    expect(details).toContain("175 tokens");
    expect(details).toContain("Task: Inspect the execution path");
    expect(details).toContain("Shared context: Repository context");
    expect(details).toContain("2 entries");
    expect(details.toLowerCase()).toContain("human output truncated");
  });

  it("renders the final result separately from the retained conversation", () => {
    const run = makeAgentsRun({
      active: false,
      status: "completed",
      result: { finalText: "The caller is in `src/index.ts`." },
      conversation,
    });
    const dialog = new AgentsDialog(data({ runs: [run] }), dependencies());
    expect(dialog.render(100).join("\n")).toContain("Result: The caller is in `src/index.ts`.");
    openConversation(dialog);
    expect(dialog.render(100).join("\n")).not.toContain("The caller is in `src/index.ts`.");
    showDetails(dialog);
    const text = dialog.render(100).join("\n");
    expect(text).toContain("Result");
    expect(text).toContain("The caller is in `src/index.ts`.");
  });

  it("shortens a long result so the conversation remains visible", () => {
    const finalText = Array.from({ length: 30 }, (_, index) => `result line ${index + 1}`).join(
      "\n",
    );
    const run = makeAgentsRun({
      active: false,
      status: "completed",
      result: { finalText },
      conversation,
    });
    const dialog = new AgentsDialog(data({ runs: [run] }), dependencies());
    openConversation(dialog);
    showDetails(dialog);
    const text = dialog.render(100).join("\n");
    expect(text).toContain("Result shortened for overlay");
    expect(text).toContain("result line 8");
    expect(text).not.toContain("result line 30");
    expect(text).toContain("Conversation");
    expect(text).toContain("I found the caller.");
  });

  it("does not report a trailing newline as truncated output", () => {
    const finalText = Array.from({ length: 8 }, (_, index) => `result line ${index + 1}`).join(
      "\n",
    );
    const run = makeAgentsRun({
      active: false,
      status: "completed",
      result: { finalText: `${finalText}\n` },
    });
    const dialog = new AgentsDialog(data({ runs: [run] }), dependencies());
    openConversation(dialog);
    showDetails(dialog);
    expect(dialog.render(100).join("\n")).not.toContain("Result shortened for overlay");
  });

  it("does not render a result section for a failed run", () => {
    const run = makeAgentsRun({
      active: false,
      status: "failed",
      result: { failureCode: "prompt-rejected", finalText: "" },
    });
    const dialog = new AgentsDialog(data({ runs: [run] }), dependencies());
    openConversation(dialog);
    showDetails(dialog);
    const text = dialog.render(100).join("\n");
    expect(text).toContain("failed (prompt-rejected)");
    expect(text).not.toContain("Result");
  });

  it("shows optional Agent Profile pages and bounded diagnostics", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    dialog.handleInput("\t");
    dialog.handleInput("\t");
    const profiles = dialog.render(100).join("\n");
    expect(profiles).toContain("Profiles");
    expect(profiles).toContain("Diagnostics");
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

  it("resets conversation paging when live data replaces the selected run", () => {
    const entries = Array.from({ length: 40 }, (_, index) => ({
      kind: "assistant" as const,
      text: `message ${index + 1}`,
    }));
    const initialRun = makeAgentsRun({ conversation: { ...conversation, entries } });
    const initial = data({ runs: [initialRun] });
    const dialog = new AgentsDialog(initial, dependencies());
    openConversation(dialog);
    dialog.render(100);
    dialog.handleInput("\x1b[5~");
    expect(dialog.render(100).join("\n")).not.toContain("message 40");
    dialog.updateData({
      ...initial,
      runs: [makeAgentsRun({ ...initialRun, key: "run:done", active: false })],
    });
    expect(dialog.render(100).join("\n")).toContain("message 40");
  });

  it("closes the viewer without stopping the selected run", () => {
    const done = vi.fn();
    const onStop = vi.fn(async () => "accepted" as const);
    const dialog = new AgentsDialog(data(), dependencies({ done, onStop }));
    dialog.handleInput("\x1b");
    expect(done).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("reports control failures without an unhandled rejection", async () => {
    const onSteer = vi.fn(async () => {
      throw new Error("TUI closed");
    });
    const dialog = new AgentsDialog(data(), dependencies({ onSteer }));
    openConversation(dialog);
    dialog.handleInput("s");
    for (const character of "Focus on tests") dialog.handleInput(character);
    dialog.handleInput("\n");
    await vi.waitFor(() => expect(dialog.render(100).join("\n")).toContain("Control failed"));
  });

  it("refreshes the embedded cursor when overlay focus changes", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    openConversation(dialog);
    dialog.handleInput("s");
    dialog.focused = true;
    expect(dialog.render(100).join("\n")).toContain(CURSOR_MARKER);
    dialog.focused = false;
    expect(dialog.render(100).join("\n")).not.toContain(CURSOR_MARKER);
  });

  it("keeps steering in the overlay and cancels without closing it", () => {
    const done = vi.fn();
    const onSteer = vi.fn(async () => "queued" as const);
    const dialog = new AgentsDialog(data(), dependencies({ done, onSteer }));
    openConversation(dialog);
    dialog.handleInput("s");
    dialog.handleInput("\n");
    expect(onSteer).not.toHaveBeenCalled();
    expect(dialog.render(100).join("\n")).toContain("Enter a steering message");
    dialog.handleInput("\x1b");
    expect(done).not.toHaveBeenCalled();
    expect(dialog.render(100).join("\n")).toContain("Control canceled");
    expect(dialog.render(100).join("\n")).toContain("s steer · x stop");
  });

  it("shows queued steering and controls only the selected active run", async () => {
    const onSteer = vi.fn(async () => "queued" as const);
    const onStop = vi.fn(async () => "accepted" as const);
    const dialog = new AgentsDialog(data(), dependencies({ onSteer, onStop }));
    openConversation(dialog);
    dialog.handleInput("s");
    expect(dialog.render(100).join("\n")).toContain("Steer inspect");
    for (const character of "Focus on tests") dialog.handleInput(character);
    dialog.handleInput("\n");
    await vi.waitFor(() => expect(dialog.render(100).join("\n")).toContain("Steering queued."));
    expect(onSteer).toHaveBeenCalledWith("inspect", "Focus on tests");
    dialog.handleInput("x");
    expect(onStop).not.toHaveBeenCalled();
    dialog.handleInput("y");
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith("inspect"));
  });

  it("reports handled input without calling it queued steering", async () => {
    const onSteer = vi.fn(async () => "handled" as const);
    const dialog = new AgentsDialog(data(), dependencies({ onSteer }));
    openConversation(dialog);
    dialog.handleInput("s");
    for (const character of "Open the help command") dialog.handleInput(character);
    dialog.handleInput("\n");

    await vi.waitFor(() =>
      expect(dialog.render(100).join("\n")).toContain(
        "Pi handled the input; it was not queued as steering.",
      ),
    );
    expect(dialog.render(100).join("\n")).not.toContain("Steering queued.");
    expect(onSteer).toHaveBeenCalledWith("inspect", "Open the help command");
  });

  it("permits selected stop during startup and shows the stopping wait", async () => {
    const onStop = vi.fn(async () => "accepted" as const);
    const starting = makeAgentsRun({ status: "starting", steeringAvailable: false });
    const dialog = new AgentsDialog(data({ runs: [starting] }), dependencies({ onStop }));
    openConversation(dialog);
    dialog.handleInput("x");
    expect(dialog.render(100).join("\n")).toContain("Press Enter or y to confirm");
    dialog.handleInput("\n");
    expect(dialog.render(100).join("\n")).toContain("Stopping selected run");
    await vi.waitFor(() => expect(onStop).toHaveBeenCalledWith("inspect"));
  });

  it("renders each lifecycle status distinctly", () => {
    const statuses = [
      "starting",
      "running",
      "stopping",
      "completed",
      "failed",
      "canceled",
      "timeout",
    ] as const;
    const runs = statuses.map((status) =>
      makeAgentsRun({
        key: `run:${status}`,
        runKey: status,
        taskId: status,
        active: ["starting", "running", "stopping"].includes(status),
        status,
        steeringAvailable: false,
      }),
    );
    const text = new AgentsDialog(data({ runs }), dependencies()).render(120).join("\n");
    for (const status of statuses) expect(text).toContain(status);
  });

  it("disables controls for a completed run", () => {
    const onSteer = vi.fn(async () => "queued" as const);
    const onStop = vi.fn(async () => "accepted" as const);
    const completed = makeAgentsRun({
      active: false,
      status: "completed",
      steeringAvailable: false,
    });
    const dialog = new AgentsDialog(data({ runs: [completed] }), dependencies({ onSteer, onStop }));
    openConversation(dialog);
    dialog.handleInput("s");
    dialog.handleInput("x");
    expect(onSteer).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(dialog.render(100).join("\n")).not.toContain("controls unavailable");
  });

  it("shows when steering is unavailable but keeps Stop available", () => {
    const run = makeAgentsRun({ steeringAvailable: false });
    const dialog = new AgentsDialog(data({ runs: [run] }), dependencies());
    openConversation(dialog);
    const text = dialog.render(100).join("\n");
    expect(text).toContain("x stop");
    expect(text).not.toContain("steering unavailable");
  });

  it("keeps every rendered line within the available width", () => {
    const dialog = new AgentsDialog(data(), dependencies());
    expect(dialog.render(60).every((line) => visibleWidth(line) <= 60)).toBe(true);
    openConversation(dialog);
    expect(dialog.render(60).every((line) => visibleWidth(line) <= 60)).toBe(true);
  });
});
