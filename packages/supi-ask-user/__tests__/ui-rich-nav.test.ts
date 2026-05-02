import type { Theme } from "@mariozechner/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "../types.ts";
import { type RichUiHost, runRichQuestionnaire } from "../ui-rich.ts";

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

const yesNoGo: NormalizedQuestion = {
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

interface RichFixture<Outcome> {
  captured: { value: Component | undefined };
  host: RichUiHost;
  outcomePromise: Promise<Outcome>;
}

function makeRichFixture<Outcome>(): RichFixture<Outcome> {
  const tuiStub = { requestRender: () => {}, terminal: { rows: 40 } } as unknown as TUI;
  const themeStub = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    bg: (_color: string, text: string) => text,
  } as unknown as Theme;
  const captured: { value: Component | undefined } = { value: undefined };
  let resolveOutcome: ((value: Outcome) => void) | undefined;
  const outcomePromise = new Promise<Outcome>((resolve) => {
    resolveOutcome = resolve;
  });
  const host: RichUiHost = {
    custom: ((
      factory: (tui: TUI, theme: Theme, kb: unknown, done: (result: Outcome) => void) => Component,
    ) => {
      captured.value = factory(tuiStub, themeStub, undefined, (outcome) =>
        resolveOutcome?.(outcome),
      );
      return outcomePromise;
    }) as unknown as RichUiHost["custom"],
  };
  return { captured, host, outcomePromise };
}

describe("runRichQuestionnaire revisit behavior", () => {
  it("restores discuss text when revisiting the discuss row", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; value?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire(
      { questions: [choice, { ...yesNoGo, id: "confirm", header: "Confirm" }], allowSkip: false },
      {
        ui: host,
      },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    for (const input of [
      "\u001b[B",
      "\u001b[B",
      "\u001b",
      "\u001b[B",
      "k",
      "e",
      "e",
      "p",
      " ",
      "m",
      "e",
      "\r",
      "\r",
      "\u001b[D",
      "\u001b[D",
    ]) {
      captured.value.handleInput?.(input);
    }

    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Discuss instead: keep me");

    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers).toEqual(
      expect.arrayContaining([{ questionId: "scope", source: "discuss", value: "keep me" }]),
    );
  });

  it("shows stored discuss text inline for multichoice discuss answers", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire(
      { questions: [multichoice, yesNoGo], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    for (const input of [
      "\u001b[B",
      "\u001b[B",
      "\u001b[B",
      "h",
      "i",
      "\r",
      "\r",
      "\u001b[D",
      "\u001b[D",
    ]) {
      captured.value.handleInput?.(input);
    }

    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Discuss instead: hi");
    expect(rendered).not.toContain("Current: hi");
  });

  it("restores other text when revisiting the other row", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; value?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire(
      { questions: [choice, { ...yesNoGo, id: "confirm", header: "Confirm" }], allowSkip: false },
      {
        ui: host,
      },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    for (const input of [
      "\u001b[B",
      "\u001b[B",
      "c",
      "u",
      "s",
      "t",
      "o",
      "m",
      " ",
      "m",
      "e",
      "\r",
      "\r",
      "\u001b[D",
      "\u001b[D",
    ]) {
      captured.value.handleInput?.(input);
    }

    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Other answer: custom me");

    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers).toEqual(
      expect.arrayContaining([{ questionId: "scope", source: "other", value: "custom me" }]),
    );
  });
});

describe("runRichQuestionnaire render state", () => {
  it("restores the previously selected answer when revising from review", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire(
      { questions: [choice, { ...yesNoGo, id: "confirm", header: "Confirm" }], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\u001b[D");

    const lines = captured.value.render(80).join("\n");
    expect(lines).toContain("> 2. No");
    expect(lines).not.toContain("> 1. Yes (recommended)");
  });

  it("hides the review hint until review is actually available", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [choice, yesNoGo], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    expect(captured.value.render(120).join("\n")).not.toContain("→/Tab review");
    captured.value.handleInput?.("\r");
    expect(captured.value.render(120).join("\n")).not.toContain("→/Tab review");
  });

  it("renders inline Other/Discuss rows without helper sub-lines", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    const initial = captured.value.render(120).join("\n");
    expect(initial).not.toContain("Type a custom answer instead of choosing one of the options");
    expect(initial).not.toContain("Continue conversationally instead of committing to a decision");

    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("x");
    const inlineOther = captured.value.render(120).join("\n");
    expect(inlineOther).toContain("Other answer: x");

    captured.value.handleInput?.("\u001b");
  });

  it("renders previews and note status in the rich UI", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");
    captured.value.handleInput?.("n");
    for (const char of "note") captured.value.handleInput?.(char);
    captured.value.handleInput?.("\r");
    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("preview A");
    expect(rendered).toContain("Notes: note");
    expect(rendered).toContain("✎");
  });

  it("auto-enters discuss input when navigating onto the discuss row", async () => {
    const discussOnlyChoice: NormalizedQuestion = {
      ...choice,
      allowOther: false,
    };
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [discussOnlyChoice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("y");

    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Discuss instead: y");
  });

  it("renders multichoice footer guidance without a submit row", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [multichoice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Space toggle");
    expect(rendered).not.toContain("Submit selections");
  });

  it("invalidates cached lines when render is called with a new width", async () => {
    const tuiStub = { requestRender: () => {} } as unknown as TUI;
    const themeStub = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    } as unknown as Theme;
    let captured: Component | undefined;
    const host: RichUiHost = {
      custom: ((
        factory: (
          tui: TUI,
          theme: Theme,
          kb: unknown,
          done: (result: unknown) => void,
        ) => Component,
      ) => {
        captured = factory(tuiStub, themeStub, undefined, () => {});
        return new Promise(() => {});
      }) as unknown as RichUiHost["custom"],
    };
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured) throw new Error("custom() was not invoked with a factory");
    const first = captured.render(80);
    const second = captured.render(80);
    expect(second).toBe(first);
    const resized = captured.render(120);
    expect(resized).not.toBe(first);
  });
});

describe("runRichQuestionnaire wrapping", () => {
  it("wraps long inline other input to the next line", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    captured.value.handleInput?.("\u001b[B");
    captured.value.handleInput?.("\u001b[B");
    for (const char of "this answer should wrap onto the next line") {
      captured.value.handleInput?.(char);
    }

    const lines = captured.value.render(32);
    const rendered = lines.join("\n");
    expect(rendered).toContain("Other answer: this");
    expect(rendered).toContain("should wrap onto");
    expect(rendered).toContain("the next line");
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(32);
    }
  });
});
