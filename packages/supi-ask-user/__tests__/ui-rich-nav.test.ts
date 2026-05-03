import type { Theme } from "@mariozechner/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import type { NormalizedQuestion } from "../src/types.ts";
import { type RichUiHost, runRichQuestionnaire } from "../src/ui-rich.ts";

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

describe("runRichQuestionnaire skip in multi-question mode", () => {
  const optionalTextQ: NormalizedQuestion = {
    id: "extra",
    header: "Extra",
    type: "text",
    prompt: "Anything else?",
    required: false,
    options: [],
  };

  const optionalChoiceQ: NormalizedQuestion = {
    ...choice,
    id: "opt",
    header: "Opt",
    required: false,
  };

  it("Escape skips the current non-required unanswered text question without closing", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; value?: string }[];
    };
    const { captured, host } = makeRichFixture<Outcome>();
    const _runPromise = runRichQuestionnaire(
      { questions: [optionalTextQ, choice, yesNoGo], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // We're on the first question (optional text). Press Escape to skip it.
    captured.value.handleInput?.("\u001b");

    // We should now be on the second question (choice), not terminal.
    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Pick");
  });

  it("s skips the current non-required unanswered structured question without closing", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; value?: string }[];
    };
    const { captured, host } = makeRichFixture<Outcome>();
    const _runPromise = runRichQuestionnaire(
      { questions: [optionalChoiceQ, choice], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // We're on the first question (optional choice). Press 's' to skip just it.
    captured.value.handleInput?.("s");

    // We should now be on the second question (required choice), not terminal.
    const rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Pick");
  });

  it("Escape on a single non-required text question advances to submitted", async () => {
    type Outcome = { terminalState: string; answers: unknown[] };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const _runPromise = runRichQuestionnaire(
      { questions: [optionalTextQ], allowSkip: false },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // For a non-required text question in single-question mode, Escape
    // advances past it → terminal with submitted (no answer provided).
    captured.value.handleInput?.("\u001b");

    const outcome = await outcomePromise;
    expect(outcome.terminalState).toBe("submitted");
  });

  it("s skips the entire questionnaire when current question is required and allowSkip is true", async () => {
    type Outcome = { terminalState: string; answers: unknown[] };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const _runPromise = runRichQuestionnaire(
      { questions: [choice, yesNoGo], allowSkip: true },
      { ui: host },
    );
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // Current question is required (choice). Press 's'.
    captured.value.handleInput?.("s");

    const outcome = await outcomePromise;
    expect(outcome.terminalState).toBe("skipped");
  });
});

describe("runRichQuestionnaire inline editor navigation", () => {
  it("navigates away from auto-activated discuss row with Up/Down without ESC", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // Navigate to discuss row — auto-enters discuss-input
    captured.value.handleInput?.("\u001b[B"); // B
    captured.value.handleInput?.("\u001b[B"); // Other (auto-enter)
    captured.value.handleInput?.("\u001b[B"); // Discuss (auto-enter via Up/Down handler)
    const inEditor = captured.value.render(120).join("\n");
    expect(inEditor).toContain("Discuss instead:");

    // Press Up to move back to Other row — should exit editor without ESC
    captured.value.handleInput?.("\u001b[A");
    const backToOther = captured.value.render(120).join("\n");
    expect(backToOther).toContain("> Other answer");
    expect(backToOther).not.toContain("Discuss instead:");

    // Press Down to return to discuss — auto-enters discuss-input again
    captured.value.handleInput?.("\u001b[B");
    const backToDiscuss = captured.value.render(120).join("\n");
    expect(backToDiscuss).toContain("Discuss instead:");
  });

  it("navigates through multiple auto-activated rows with Up/Down keys", async () => {
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire({ questions: [choice], allowSkip: false }, { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // Start on option A, go down through options via Down key
    captured.value.handleInput?.("\u001b[B"); // option B
    let rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("> 2. B");

    captured.value.handleInput?.("\u001b[B"); // Other (auto-enter)
    rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Other answer:");

    captured.value.handleInput?.("\u001b[B"); // Discuss (auto-enter via Up/Down handler)
    rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Discuss instead:");

    // Go back up through all rows
    captured.value.handleInput?.("\u001b[A"); // Other (auto-enter via Up/Down handler)
    rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("Other answer:");

    captured.value.handleInput?.("\u001b[A"); // option B
    rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("> 2. B");

    captured.value.handleInput?.("\u001b[A"); // option A
    rendered = captured.value.render(120).join("\n");
    expect(rendered).toContain("> 1. A");
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
