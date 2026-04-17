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
};

const yesNoGo: NormalizedQuestion = {
  id: "go",
  header: "Go?",
  type: "yesno",
  prompt: "Proceed?",
  options: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
  recommendedIndex: 0,
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
      factory: (tui: TUI, theme: Theme, kb: unknown, done: (r: Outcome) => void) => Component,
    ) => {
      captured.value = factory(tuiStub, themeStub, undefined, (outcome) =>
        resolveOutcome?.(outcome),
      );
      return outcomePromise;
    }) as unknown as RichUiHost["custom"],
  };
  return { captured, host, outcomePromise };
}

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

    captured.handleInput?.("\r"); // Q1: choose A → advance to Q2
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
    const { captured, host } = makeRichFixture<unknown>();
    void runRichQuestionnaire([choice, { ...yesNoGo, id: "confirm", header: "Confirm" }], {
      ui: host,
    });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    captured.value.handleInput?.("\r"); // Q1: choose A → advance to Q2
    captured.value.handleInput?.("\u001b[B"); // Q2: move from Yes to No
    captured.value.handleInput?.("\r"); // Q2: answer No → enter review
    captured.value.handleInput?.("\u001b[D"); // review: go back to revise Q2

    const lines = captured.value.render(80).join("\n");
    expect(lines).toContain("> 2. No");
    expect(lines).not.toContain("> 1. Yes (recommended)");
  });

  it("preserves a previously attached note when revising and re-confirming", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; value: string; comment?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire([choice, yesNoGo], { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // Q1: stage a note via `n`, type "ctx", submit, then confirm option A.
    for (const ch of "nctx") captured.value.handleInput?.(ch);
    captured.value.handleInput?.("\r"); // submit note → subMode back to select
    captured.value.handleInput?.("\r"); // confirm Q1 option A with comment attached
    // Q2: accept default (Yes) → enter review.
    captured.value.handleInput?.("\r");
    // Review: ← back to Q2, then ← again back to Q1 to revise it.
    captured.value.handleInput?.("\u001b[D");
    captured.value.handleInput?.("\u001b[D");
    // Q1: re-confirm the same answer without touching the note. The previous
    // comment must be rehydrated and written back, not silently dropped.
    captured.value.handleInput?.("\r");
    // Q2: re-confirm → review → submit.
    captured.value.handleInput?.("\r");
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome.terminalState).toBe("submitted");
    const q1 = outcome.answers.find((a) => a.questionId === "scope");
    expect(q1?.comment).toBe("ctx");
  });

  it("keeps a pending note across navigation before the answer is confirmed", async () => {
    type Outcome = {
      terminalState: string;
      answers: { questionId: string; value: string; comment?: string }[];
    };
    const { captured, host, outcomePromise } = makeRichFixture<Outcome>();
    const runPromise = runRichQuestionnaire([choice, yesNoGo], { ui: host });
    await Promise.resolve();
    if (!captured.value) throw new Error("custom() was not invoked with a factory");

    // Q1: confirm option A with no note attached.
    captured.value.handleInput?.("\r");
    // Q2: stage a note ("foo") but do NOT confirm the answer.
    for (const ch of "nfoo") captured.value.handleInput?.(ch);
    captured.value.handleInput?.("\r"); // submit note → subMode back to select on Q2
    // Navigate back to Q1 and then forward again by re-confirming.
    captured.value.handleInput?.("\u001b[D"); // ← back to Q1
    captured.value.handleInput?.("\r"); // re-confirm Q1 → back on Q2
    // Q2: confirm the default (Yes). The staged note must still be attached.
    captured.value.handleInput?.("\r");
    // Review → submit.
    captured.value.handleInput?.("\r");

    const outcome = await outcomePromise;
    await expect(runPromise).resolves.toEqual(outcome);
    expect(outcome.terminalState).toBe("submitted");
    const q2 = outcome.answers.find((a) => a.questionId === "go");
    expect(q2?.comment).toBe("foo");
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
