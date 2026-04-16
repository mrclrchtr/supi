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
    { value: "a", label: "A" },
    { value: "b", label: "B" },
  ],
  allowOther: false,
};

describe("runRichQuestionnaire", () => {
  it("submits from review after a final text question", async () => {
    const tuiStub = { requestRender: () => {} } as unknown as TUI;
    const themeStub = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as unknown as Theme;
    const textLast: NormalizedQuestion[] = [
      choice,
      {
        id: "note",
        header: "Note",
        type: "text",
        prompt: "Why?",
        options: [],
        allowOther: false,
      },
    ];
    type Outcome = { terminalState: string; answers: { questionId: string; value: string }[] };
    let captured: Component | undefined;
    let resolveOutcome: ((value: Outcome) => void) | undefined;
    const outcomePromise = new Promise<Outcome>((resolve) => {
      resolveOutcome = resolve;
    });
    const host: RichUiHost = {
      custom: ((
        factory: (tui: TUI, theme: Theme, kb: unknown, done: (r: Outcome) => void) => Component,
      ) => {
        captured = factory(tuiStub, themeStub, undefined, (outcome) => resolveOutcome?.(outcome));
        return outcomePromise;
      }) as unknown as RichUiHost["custom"],
    };

    const runPromise = runRichQuestionnaire(textLast, { ui: host });
    await Promise.resolve();
    if (!captured) throw new Error("custom() was not invoked with a factory");

    captured.handleInput?.("\r"); // Q1: choose A → comment-prompt
    captured.handleInput?.("n"); // skip comment → advance to Q2
    captured.handleInput?.("o");
    captured.handleInput?.("k");
    captured.handleInput?.("\r"); // Q2: submit "ok" → review
    captured.handleInput?.("\r"); // review: submit

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers).toMatchObject([
      { questionId: "scope", value: "a" },
      { questionId: "note", value: "ok" },
    ]);
  });

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
    // pi's `{ overlay: true }` mode renders on top of existing content without
    // clearing the screen, which produces a duplicated tab bar after every
    // re-render. Calling custom() with no options makes pi replace the editor
    // cleanly, matching the reference questionnaire example.
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

  it("aborts mid-overlay when the signal fires after the questionnaire opens", async () => {
    const tuiStub = { requestRender: () => {} } as unknown as TUI;
    const themeStub = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as unknown as Theme;
    type Outcome = { terminalState: string; answers: unknown[] };
    let resolveOutcome: ((value: Outcome) => void) | undefined;
    const outcomePromise = new Promise<Outcome>((resolve) => {
      resolveOutcome = resolve;
    });
    const host: RichUiHost = {
      custom: ((
        factory: (tui: TUI, theme: Theme, kb: unknown, done: (r: Outcome) => void) => Component,
      ) => {
        factory(tuiStub, themeStub, undefined, (outcome) => resolveOutcome?.(outcome));
        return outcomePromise;
      }) as unknown as RichUiHost["custom"],
    };
    const controller = new AbortController();
    void runRichQuestionnaire([choice], { ui: host, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    const outcome = await outcomePromise;
    expect(outcome.terminalState).toBe("aborted");
    expect(outcome.answers).toEqual([]);
  });
});

describe("runRichQuestionnaire render state", () => {
  it("restores the previously selected structured answer when revising from review", async () => {
    const tuiStub = { requestRender: () => {} } as unknown as TUI;
    const themeStub = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      bg: (_color: string, text: string) => text,
    } as unknown as Theme;
    const questions: NormalizedQuestion[] = [
      choice,
      {
        id: "confirm",
        header: "Confirm",
        type: "yesno",
        prompt: "Proceed?",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
        allowOther: false,
        recommendedIndex: 0,
      },
    ];
    let captured: Component | undefined;
    const host: RichUiHost = {
      custom: ((
        factory: (tui: TUI, theme: Theme, kb: unknown, done: (r: unknown) => void) => Component,
      ) => {
        captured = factory(tuiStub, themeStub, undefined, () => {});
        return new Promise(() => {});
      }) as unknown as RichUiHost["custom"],
    };

    void runRichQuestionnaire(questions, { ui: host });
    await Promise.resolve();
    if (!captured) throw new Error("custom() was not invoked with a factory");

    captured.handleInput?.("\r"); // Q1: choose A → comment-prompt
    captured.handleInput?.("n"); // skip comment → advance to Q2
    captured.handleInput?.("\u001b[B"); // Q2: move from Yes to No
    captured.handleInput?.("\r"); // Q2: answer No → comment-prompt
    captured.handleInput?.("n"); // skip comment → enter review
    captured.handleInput?.("\u001b[D"); // review: go back to revise Q2

    const lines = captured.render(80).join("\n");
    expect(lines).toContain("> 2. No");
    expect(lines).not.toContain("> 1. Yes (recommended)");
  });

  it("invalidates cached lines when render is called with a new width", async () => {
    const tuiStub = { requestRender: () => {} } as unknown as TUI;
    const themeStub = {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as unknown as Theme;
    let captured: Component | undefined;
    const host: RichUiHost = {
      custom: ((
        factory: (tui: TUI, theme: Theme, kb: unknown, done: (r: unknown) => void) => Component,
      ) => {
        captured = factory(tuiStub, themeStub, undefined, () => {});
        return new Promise(() => {});
      }) as unknown as RichUiHost["custom"],
    };
    void runRichQuestionnaire([choice], { ui: host });
    await Promise.resolve();
    if (!captured) throw new Error("custom() was not invoked with a factory");
    const first = captured.render(80);
    const second = captured.render(80); // same width → cache hit, identity preserved
    expect(second).toBe(first);
    const resized = captured.render(120); // width changed → must recompute
    expect(resized).not.toBe(first);
  });
});
