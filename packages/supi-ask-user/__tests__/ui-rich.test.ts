import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedQuestion } from "../src/types.ts";
import {
  type RichCustomOptions,
  type RichUiHost,
  runRichQuestionnaire,
} from "../src/ui/ui-rich.ts";
import { makeRichFixture } from "./helpers.ts";

const mockRenderMarkdown = vi.hoisted(() =>
  vi.fn((text: string, _width: number, _theme: unknown, options?: { paddingX?: number }) => {
    const lines = text.split("\n");
    const paddingX = options?.paddingX ?? 1;
    if (paddingX > 0) {
      return lines.map((line) => " ".repeat(paddingX) + line);
    }
    return lines;
  }),
);

vi.mock("../src/render/ui-rich-render-markdown", () => ({
  renderMarkdown: mockRenderMarkdown,
  renderMarkdownPreview: mockRenderMarkdown,
}));

beforeEach(() => {
  mockRenderMarkdown.mockClear();
});

const choice: NormalizedQuestion = {
  id: "scope",
  header: "Scope",
  type: "choice",
  prompt: "Pick",
  required: true,
  options: [
    { value: "a", label: "A", preview: "preview A" },
    { value: "b", label: "B", preview: "preview B" },
  ],
  allowOther: true,
  allowDiscuss: true,
  recommendedIndexes: [0],
};

const multichoice: NormalizedQuestion = {
  id: "features",
  header: "Features",
  type: "multichoice",
  prompt: "Pick features",
  required: true,
  options: [
    { value: "preview", label: "Preview" },
    { value: "multi", label: "Multi-select" },
    { value: "discuss", label: "Discuss" },
  ],
  allowOther: false,
  allowDiscuss: true,
  recommendedIndexes: [0],
};

const _yesNoGo: NormalizedQuestion = {
  id: "go",
  header: "Go?",
  type: "yesno",
  prompt: "Proceed?",
  required: true,
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
  allowOther: false,
  allowDiscuss: true,
  recommendedIndexes: [0],
};

const textQuestion: NormalizedQuestion = {
  id: "reason",
  header: "Reason",
  type: "text",
  prompt: "Why?",
  required: true,
  options: [],
};

describe("runRichQuestionnaire lifecycle", () => {
  it("returns an aborted outcome without opening the overlay when the signal is already aborted", async () => {
    const custom = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const host: RichUiHost = { custom: custom as unknown as RichUiHost["custom"] };
    const result = await runRichQuestionnaire(
      { questions: [choice], allowSkip: false },
      { ui: host, signal: controller.signal },
    );
    expect(result).not.toBe("unsupported");
    expect(result).toMatchObject({ terminalState: "aborted", answers: [] });
    expect(custom).not.toHaveBeenCalled();
  });

  it("reports 'unsupported' when the host declines to provide an overlay", async () => {
    const host: RichUiHost = { custom: (() => undefined) as unknown as RichUiHost["custom"] };
    const result = await runRichQuestionnaire(
      { questions: [choice], allowSkip: false },
      { ui: host },
    );
    expect(result).toBe("unsupported");
  });

  it("opens via ctx.ui.custom() without options so pi replaces the editor area", async () => {
    let optionsArg: RichCustomOptions | undefined;
    let optionsArgPresent = false;
    const host: RichUiHost = {
      custom: ((_factory: unknown, ...rest: unknown[]) => {
        optionsArgPresent = rest.length > 0;
        optionsArg = rest[0] as RichCustomOptions | undefined;
        return new Promise(() => {});
      }) as unknown as RichUiHost["custom"],
    };
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    expect(optionsArgPresent).toBe(false);
    expect(optionsArg).toBeUndefined();
  });

  it("pre-fills text input with default value when present", async () => {
    const textWithDefault: NormalizedQuestion = {
      id: "name",
      header: "Name",
      type: "text",
      prompt: "Enter name",
      required: true,
      options: [],
      default: "default-value",
    };
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [textWithDefault], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    const rendered = captured.value.render(100).join("\n");
    expect(rendered).toContain("default-value");
  });

  it("skips required text questions with Ctrl-S when skip is allowed", async () => {
    type Outcome = { terminalState: string; skipped?: true; answers: unknown[] };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire(
      { questions: [textQuestion], allowSkip: true },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    expect(captured.value.render(100).join("\n")).toContain("Ctrl-S skip");
    captured.value.handleInput?.("\x13");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({ terminalState: "skipped", skipped: true, answers: [] });
  });

  it("supports an explicit discuss flow", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; value?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire(
      { questions: [choice], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b");
    captured.value.handleInput?.("\u001b[B");
    for (const char of "need context") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "discuss", value: "need context" }],
    });
  });

  it("supports multichoice selection, notes, review, and submission", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; values?: string[]; selections?: unknown[] }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire(
      { questions: [multichoice], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    for (const input of [
      "n",
      "b",
      "e",
      "s",
      "t",
      "\r",
      "space",
      "\u001b[B",
      "n",
      "m",
      "u",
      "s",
      "t",
      "\r",
      "space",
      "\r",
      "\r",
    ]) {
      captured.value.handleInput?.(input === "space" ? " " : input);
    }

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [
        {
          questionId: "features",
          source: "options",
          values: ["preview", "multi"],
          selections: [
            { value: "preview", optionIndex: 0, note: "best" },
            { value: "multi", optionIndex: 1, note: "must" },
          ],
        },
      ],
    });
  });
});

describe("runRichQuestionnaire notes", () => {
  it("shows the note hotkey on selection rows but not on discuss rows", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    expect(captured.value.render(100).join("\n")).toContain("n add note");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b[B");
    expect(captured.value.render(100).join("\n")).not.toContain("n add note");
  });

  it("single-select notes follow the active answer before submission", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; optionIndex?: number; note?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire(
      { questions: [choice], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    captured.value.handleInput?.("n");
    for (const char of "because") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome).toMatchObject({
      terminalState: "submitted",
      answers: [{ questionId: "scope", source: "option", optionIndex: 1, note: "because" }],
    });
  });

  it("preserves multichoice notes across uncheck and re-check and shows review lines", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [multichoice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    for (const input of [
      "n",
      "b",
      "e",
      "s",
      "t",
      "\r",
      "space",
      "\u001b[B",
      "n",
      "c",
      "o",
      "r",
      "e",
      "\r",
      "space",
      "\u001b[A",
      "space",
      "space",
      "\r",
    ]) {
      captured.value.handleInput?.(input === "space" ? " " : input);
    }

    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Preview — best");
    expect(rendered).toContain("Multi-select — core");
  });
});

const choiceWithVaryingPreviews: NormalizedQuestion = {
  id: "commit-strategy",
  header: "Strategy",
  type: "choice",
  prompt: "How to commit?",
  required: true,
  options: [
    {
      value: "single",
      label: "Single commit",
      description: "All changes in one commit",
      preview: "1. feat: everything",
    },
    {
      value: "two",
      label: "Two commits",
      preview: "1. feat: first change\n2. feat: second change\n3. chore: cleanup\n4. docs: update",
    },
    { value: "three", label: "Three commits" },
  ],
  allowOther: false,
  allowDiscuss: false,
  recommendedIndexes: [1],
};

describe("render height stability", () => {
  it("output length does not decrease when navigating from long preview to no preview", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire(
      { questions: [choiceWithVaryingPreviews], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked");

    // Initial render — recommended index 1 ("Two commits") has 4-line preview
    const initialLines = captured.value.render(80);
    const initialLength = initialLines.length;
    expect(initialLength).toBeGreaterThan(0);

    // Navigate to option 3 ("Three commits") — no preview at all
    captured.value.handleInput?.("\u001b[B"); // down to option 3
    const afterNav = captured.value.render(80);
    expect(afterNav.length).toBeGreaterThanOrEqual(initialLength);
  });

  it("output length increases when navigating to an option with a longer preview", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire(
      { questions: [choiceWithVaryingPreviews], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked");

    // Start on recommended index 1 ("Two commits", 4-line preview)
    // Navigate up to option 1 ("Single commit", 1-line preview)
    captured.value.handleInput?.("\u001b[A"); // up
    const shortPreview = captured.value.render(80);
    const shortLength = shortPreview.length;

    // Navigate back to option 2 ("Two commits", 4-line preview)
    captured.value.handleInput?.("\u001b[B"); // down
    const longPreview = captured.value.render(80);
    expect(longPreview.length).toBeGreaterThan(shortLength);
  });

  it("maxHeight resets when resetStateForCurrent is called (question change)", async () => {
    const twoQuestions: NormalizedQuestion[] = [
      choiceWithVaryingPreviews,
      {
        id: "confirm",
        header: "Confirm",
        type: "yesno",
        prompt: "Sure?",
        required: true,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
        allowOther: false,
        allowDiscuss: false,
        recommendedIndexes: [0],
      },
    ];

    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: twoQuestions, allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked");

    // Render first question — tall due to preview
    const q1Lines = captured.value.render(80);

    // Submit option 1 to advance to question 2
    captured.value.handleInput?.("\u001b[A"); // up to option 1
    captured.value.handleInput?.("\r"); // submit

    // Render second question — yesno, much shorter, should NOT carry q1's height
    const q2Lines = captured.value.render(80);
    expect(q2Lines.length).toBeLessThan(q1Lines.length);
  });
});

describe("markdown preview rendering", () => {
  it("renders option previews as markdown in split view", async () => {
    mockRenderMarkdown.mockReturnValueOnce([" md line 1", " md line 2"]);
    const markdownQuestion: NormalizedQuestion = {
      id: "md",
      header: "Markdown",
      type: "choice",
      prompt: "Pick",
      required: true,
      options: [{ value: "a", label: "A", preview: "# Hello\nWorld" }],
      allowOther: false,
      allowDiscuss: false,
      recommendedIndexes: [0],
    };
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [markdownQuestion], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked");

    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("md line 1");
    expect(rendered).toContain("md line 2");
    expect(mockRenderMarkdown).toHaveBeenCalledWith(
      "# Hello\nWorld",
      expect.any(Number),
      expect.any(Object),
    );
  });

  it("renders option previews as markdown in narrow fallback block", async () => {
    mockRenderMarkdown.mockReturnValueOnce([" fallback md"]);
    const markdownQuestion: NormalizedQuestion = {
      id: "md",
      header: "Markdown",
      type: "choice",
      prompt: "Pick",
      required: true,
      options: [{ value: "a", label: "A", preview: "`code`" }],
      allowOther: false,
      allowDiscuss: false,
      recommendedIndexes: [0],
    };
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [markdownQuestion], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked");

    // Render at 80 cols — split view requires >= 100, so this falls back to block
    const rendered = captured.value.render(80).join("\n");
    expect(rendered).toContain("fallback md");
    expect(mockRenderMarkdown).toHaveBeenCalledWith(
      "`code`",
      expect.any(Number),
      expect.any(Object),
    );
  });
});
