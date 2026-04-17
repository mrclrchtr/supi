import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { NormalizedQuestion } from "../types.ts";
import { type RichCustomOptions, type RichUiHost, runRichQuestionnaire } from "../ui-rich.ts";

const choice: NormalizedQuestion = {
  id: "scope",
  header: "Scope",
  type: "choice",
  prompt: "Pick",
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
  const tuiStub = { requestRender: () => {} } as unknown as TUI;
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

describe("runRichQuestionnaire lifecycle", () => {
  it("returns an aborted outcome without opening the overlay when the signal is already aborted", async () => {
    const custom = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const host: RichUiHost = { custom: custom as unknown as RichUiHost["custom"] };
    const result = await runRichQuestionnaire([choice], { ui: host, signal: controller.signal });
    expect(result).not.toBe("unsupported");
    expect(result).toMatchObject({ terminalState: "aborted", answers: [] });
    expect(custom).not.toHaveBeenCalled();
  });

  it("reports 'unsupported' when the host declines to provide an overlay", async () => {
    const host: RichUiHost = { custom: (() => undefined) as unknown as RichUiHost["custom"] };
    const result = await runRichQuestionnaire([choice], { ui: host });
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
    void runRichQuestionnaire([choice], { ui: host });
    await Promise.resolve();
    expect(optionsArgPresent).toBe(false);
    expect(optionsArg).toBeUndefined();
  });

  it("supports an explicit discuss flow", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; source: string; value?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire([choice], { ui: host });
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
    const runPromise = runRichQuestionnaire([multichoice], { ui: host });
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
    void runRichQuestionnaire([choice], { ui: host });
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
    const runPromise = runRichQuestionnaire([choice], { ui: host });
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
    void runRichQuestionnaire([multichoice], { ui: host });
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
