import { describe, expect, it } from "vitest";
import { normalizeQuestionnaire } from "../normalize.ts";
import type { AskUserParams } from "../schema.ts";
import { type FallbackUi, runFallbackQuestionnaire } from "../ui-fallback.ts";

interface Step {
  // For select: the label index to pick (or undefined to dismiss)
  // For confirm: the boolean to return
  // For input: the string to return (or undefined to dismiss)
  kind: "select" | "confirm" | "input";
  result: string | boolean | undefined;
}

function scriptedUi(steps: Step[]): FallbackUi {
  const queue = [...steps];
  const next = (kind: Step["kind"]): Step["result"] => {
    const step = queue.shift();
    if (!step) throw new Error(`fallback ui ran out of scripted steps when expecting ${kind}`);
    if (step.kind !== kind) {
      throw new Error(`expected ${kind}, scripted ${step.kind}`);
    }
    return step.result;
  };
  return {
    select: async (_title, options) => {
      const result = next("select");
      if (result === undefined) return undefined;
      if (typeof result === "string") return result;
      const idx = result as unknown as number;
      return typeof idx === "number" ? options[idx] : undefined;
    },
    confirm: async () => Boolean(next("confirm")),
    input: async () => {
      const r = next("input");
      return r === undefined ? undefined : String(r);
    },
  };
}

const choiceParams: AskUserParams = {
  questions: [
    {
      type: "choice",
      id: "scope",
      header: "Scope",
      prompt: "Pick scope",
      options: [
        { value: "narrow", label: "Narrow" },
        { value: "broad", label: "Broad" },
      ],
    },
  ],
};

describe("runFallbackQuestionnaire", () => {
  it("submits when the user selects a single choice option", async () => {
    const ui = scriptedUi([
      { kind: "select", result: 0 as unknown as string },
      { kind: "select", result: 1 as unknown as string }, // skip comment
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers[0]).toMatchObject({
      questionId: "scope",
      source: "option",
      value: "narrow",
      optionIndex: 0,
    });
  });

  it("captures Other freeform input as a separate source", async () => {
    const params: AskUserParams = {
      questions: [{ ...(choiceParams.questions[0] as object), allowOther: true } as never],
    };
    const ui = scriptedUi([
      { kind: "select", result: 2 as unknown as string }, // Other (after narrow/broad)
      { kind: "input", result: "scope to api/" },
      { kind: "select", result: 1 as unknown as string }, // skip comment
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers[0]).toMatchObject({ source: "other", value: "scope to api/" });
  });

  it("reprompts the Other dialog until the user submits non-empty text", async () => {
    const params: AskUserParams = {
      questions: [{ ...(choiceParams.questions[0] as object), allowOther: true } as never],
    };
    const ui = scriptedUi([
      { kind: "select", result: 2 as unknown as string },
      { kind: "input", result: "" },
      { kind: "input", result: "   " },
      { kind: "input", result: "scope to api/" },
      { kind: "select", result: 1 as unknown as string }, // skip comment
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers[0]).toMatchObject({ source: "other", value: "scope to api/" });
  });

  it("cancels the questionnaire only when the Other dialog is dismissed", async () => {
    const params: AskUserParams = {
      questions: [{ ...(choiceParams.questions[0] as object), allowOther: true } as never],
    };
    const ui = scriptedUi([
      { kind: "select", result: 2 as unknown as string },
      { kind: "input", result: undefined },
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("cancelled");
    expect(outcome.answers).toEqual([]);
  });

  it("rejects empty text submissions and re-prompts until non-empty", async () => {
    const ui = scriptedUi([
      { kind: "input", result: "   " },
      { kind: "input", result: "" },
      { kind: "input", result: "actual answer" },
    ]);
    const params: AskUserParams = {
      questions: [{ type: "text", id: "name", header: "Name", prompt: "Name?" }],
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers[0].value).toBe("actual answer");
  });

  it("treats undefined select return as cancellation", async () => {
    const ui = scriptedUi([{ kind: "select", result: undefined }]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("cancelled");
    expect(outcome.answers).toEqual([]);
  });

  it("treats signal.aborted between dialogs as aborted terminal state", async () => {
    const controller = new AbortController();
    const ui: FallbackUi = {
      select: async () => {
        controller.abort();
        return undefined;
      },
      confirm: async () => false,
      input: async () => undefined,
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(choiceParams).questions, {
      ui,
      signal: controller.signal,
    });
    expect(outcome.terminalState).toBe("aborted");
  });

  it("forwards signal into every dialog call so pi can cancel a pending prompt", async () => {
    const seenSignals: (AbortSignal | undefined)[] = [];
    const ui: FallbackUi = {
      select: async (_t, options, opts) => {
        seenSignals.push(opts?.signal);
        return options[0];
      },
      confirm: async (_t, _m, opts) => {
        seenSignals.push(opts?.signal);
        return true;
      },
      input: async (_t, _p, opts) => {
        seenSignals.push(opts?.signal);
        return "note";
      },
    };
    const controller = new AbortController();
    const params: AskUserParams = {
      questions: [{ ...(choiceParams.questions[0] as object) } as never],
    };
    await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
      signal: controller.signal,
    });
    // select for the choice + select for the comment Yes/No prompt + input for the note
    expect(seenSignals.length).toBeGreaterThanOrEqual(3);
    for (const s of seenSignals) expect(s).toBe(controller.signal);
  });
});

describe("runFallbackQuestionnaire — multi-question + yesno extras", () => {
  it("walks through a multi-question questionnaire, reviews, and submits", async () => {
    const params: AskUserParams = {
      questions: [
        choiceParams.questions[0],
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?" },
      ],
    };
    const ui = scriptedUi([
      { kind: "select", result: 1 as unknown as string }, // broad
      { kind: "select", result: 1 as unknown as string }, // skip comment
      { kind: "select", result: 0 as unknown as string }, // yes
      { kind: "select", result: 1 as unknown as string }, // skip comment
      { kind: "select", result: "Submit answers" }, // review step picks Submit
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("submitted");
    expect(outcome.answers.map((a) => a.value)).toEqual(["broad", "yes"]);
  });

  it("multi-question review can be cancelled before submit", async () => {
    const params: AskUserParams = {
      questions: [
        choiceParams.questions[0],
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?" },
      ],
    };
    const ui = scriptedUi([
      { kind: "select", result: 0 as unknown as string },
      { kind: "select", result: 1 as unknown as string }, // skip comment
      { kind: "select", result: 0 as unknown as string },
      { kind: "select", result: 1 as unknown as string }, // skip comment
      { kind: "select", result: "Cancel questionnaire" },
    ]);
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("cancelled");
  });

  it("yesno questions support recommendation in the dialog labels", async () => {
    const recordedLabels: string[][] = [];
    const ui: FallbackUi = {
      select: async (_t, options) => {
        recordedLabels.push([...options]);
        return options[0];
      },
      confirm: async () => false,
      input: async () => undefined,
    };
    const params: AskUserParams = {
      questions: [
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?", recommendation: "no" },
      ],
    };
    await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, { ui });
    expect(recordedLabels[0]).toEqual(["1. Yes", "2. No (recommended)"]);
  });

  it("surfaces option descriptions in the select dialog labels", async () => {
    const params: AskUserParams = {
      questions: [
        {
          type: "choice",
          id: "scope",
          header: "Scope",
          prompt: "Pick scope",
          options: [
            { value: "narrow", label: "Narrow", description: "limit to api/" },
            { value: "broad", label: "Broad", description: "entire repo" },
          ],
        },
      ],
    };
    const recorded: string[][] = [];
    const ui: FallbackUi = {
      select: async (_t, options) => {
        recorded.push([...options]);
        return options[0];
      },
      confirm: async () => false,
      input: async () => undefined,
    };
    await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, { ui });
    expect(recorded[0]).toEqual(["1. Narrow — limit to api/", "2. Broad — entire repo"]);
  });

  it("disambiguates duplicate option labels by index prefix", async () => {
    const params: AskUserParams = {
      questions: [
        {
          type: "choice",
          id: "dup",
          header: "Dup",
          prompt: "Pick",
          options: [
            { value: "a", label: "Same" },
            { value: "b", label: "Same" },
          ],
        },
      ],
    };
    const recorded: string[][] = [];
    const ui: FallbackUi = {
      select: async (_t, options) => {
        recorded.push([...options]);
        return options[1]; // pick the second of two same-labeled options
      },
      confirm: async () => false,
      input: async () => undefined,
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(recorded[0]).toEqual(["1. Same", "2. Same"]);
    expect(outcome.answers[0]).toMatchObject({ value: "b", optionIndex: 1 });
  });

  it("review step shows comments alongside answers", async () => {
    const params: AskUserParams = {
      questions: [
        { ...(choiceParams.questions[0] as object) } as never,
        { type: "yesno", id: "go", header: "Go?", prompt: "Proceed?" },
      ],
    };
    let reviewTitle = "";
    let phase = 0;
    const ui: FallbackUi = {
      select: async (title, options) => {
        phase += 1;
        if (phase === 1) return options[0]; // narrow
        if (phase === 2) return options[0]; // "Yes, add a note"
        if (phase === 3) return options[0]; // yesno: Yes
        if (phase === 4) return options[1]; // "No, skip" comment for yesno
        reviewTitle = title;
        return options[0]; // Submit answers
      },
      confirm: async () => true,
      input: async () => "rationale here",
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.terminalState).toBe("submitted");
    expect(reviewTitle).toContain("rationale here");
  });

  it("yesno supports allowOther and records source 'other'", async () => {
    const ui = scriptedUi([
      { kind: "select", result: 2 as unknown as string }, // Other
      { kind: "input", result: "depends on the deploy" },
      { kind: "select", result: 1 as unknown as string }, // skip comment
    ]);
    const params: AskUserParams = {
      questions: [{ type: "yesno", id: "go", header: "Go?", prompt: "Proceed?", allowOther: true }],
    };
    const outcome = await runFallbackQuestionnaire(normalizeQuestionnaire(params).questions, {
      ui,
    });
    expect(outcome.answers[0]).toMatchObject({ source: "other", value: "depends on the deploy" });
  });
});
