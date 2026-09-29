import { resolve } from "node:path";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { createJiti } from "jiti";
import { describe, expect, it } from "vitest";
import type { AskUserFormUi } from "../../src/api.ts";
import { normalizeQuestionnaire, openAskUserForm } from "../../src/api.ts";

const questionnaire = normalizeQuestionnaire({
  title: "Formatter",
  questions: [
    {
      type: "choice",
      id: "formatter",
      header: "Formatter",
      prompt: "Which formatter should I use?",
      options: [
        { value: "biome", label: "Biome" },
        { value: "prettier", label: "Prettier" },
      ],
    },
  ],
});

function makeUi(onForm: (component: Component & { handleInput(data: string): void }) => void) {
  let overlay: boolean | undefined;
  const ui: AskUserFormUi = {
    custom: async (factory, options) => {
      overlay = options?.overlay;
      return await new Promise((resolve) => {
        const component = factory(
          { terminal: { rows: 40 }, requestRender() {} } as TUI,
          {} as never,
          { matches: () => false } as never,
          resolve,
        );
        onForm(component as Component & { handleInput(data: string): void });
      });
    },
  };
  return { ui, getOverlay: () => overlay };
}

describe("reusable form API", () => {
  it("opens the shared form in the editor area and returns its ordered response", async () => {
    const { ui, getOverlay } = makeUi((form) => {
      form.handleInput("\r");
      form.handleInput("\r");
    });

    const result = await openAskUserForm(questionnaire, { ui });

    expect(getOverlay()).toBeUndefined();
    expect(result).toEqual({
      outcome: "submitted",
      responses: [
        {
          questionId: "formatter",
          answer: {
            kind: "choice",
            answered: true,
            options: [{ value: "biome", label: "Biome", selected: true }],
          },
        },
      ],
    });
  });

  it("uses an overlay when the caller requests it", async () => {
    const { ui, getOverlay } = makeUi((form) => {
      form.handleInput("\r");
      form.handleInput("\r");
    });

    const result = await openAskUserForm(questionnaire, { ui, overlay: true });

    expect(getOverlay()).toBe(true);
    expect(result).toMatchObject({ outcome: "submitted" });
  });

  it("returns caller cancellation without turning it into an answer", async () => {
    const controller = new AbortController();
    const { ui } = makeUi(() => controller.abort());

    await expect(
      openAskUserForm(questionnaire, { ui, signal: controller.signal }),
    ).resolves.toEqual({
      kind: "abort",
    });
  });

  it("shares form ownership across independent Jiti module loads per TUI runtime", async () => {
    const loadApi = createJiti(import.meta.url, { moduleCache: false });
    const firstApi = await loadApi.import<typeof import("../../src/api.ts")>(
      resolve("packages/supi-ask-user/src/api.ts"),
    );
    const secondApi = await loadApi.import<typeof import("../../src/api.ts")>(
      resolve("packages/supi-ask-user/src/api.ts"),
    );
    expect(secondApi.openAskUserForm).not.toBe(firstApi.openAskUserForm);
    const firstTui = { terminal: { rows: 40 }, requestRender() {} } as TUI;
    const otherTui = { terminal: { rows: 40 }, requestRender() {} } as TUI;
    let finishFirst: (() => void) | undefined;
    let finishOther: (() => void) | undefined;
    let firstFormCount = 0;
    const makePendingUi = (tui: TUI, setFinish: (finish: () => void) => void): AskUserFormUi => ({
      custom: async <T>(
        factory: (
          tui: TUI,
          theme: Theme,
          keybindings: KeybindingsManager,
          done: (value: T) => void,
        ) => Component,
      ) =>
        await new Promise<T>((resolvePromise, reject) => {
          try {
            const component = factory(
              tui,
              {} as Theme,
              { matches: () => false } as never,
              resolvePromise,
            );
            firstFormCount++;
            setFinish(() => {
              (component as Component & { handleInput(data: string): void }).handleInput("\u001b");
            });
          } catch (error) {
            reject(error);
          }
        }),
    });
    const firstUi = makePendingUi(firstTui, (finish) => {
      finishFirst = finish;
    });
    const sameRuntimeUi = makePendingUi(firstTui, () => undefined);
    const otherRuntimeUi = makePendingUi(otherTui, (finish) => {
      finishOther = finish;
    });

    const first = firstApi.openAskUserForm(questionnaire, { ui: firstUi });
    const otherRuntime = secondApi.openAskUserForm(questionnaire, { ui: otherRuntimeUi });
    await expect(secondApi.openAskUserForm(questionnaire, { ui: sameRuntimeUi })).rejects.toThrow(
      "another ask_user form is already in flight",
    );

    expect(firstFormCount).toBe(2);
    finishFirst?.();
    finishOther?.();
    await expect(first).resolves.toEqual({ kind: "cancel" });
    await expect(otherRuntime).resolves.toEqual({ kind: "cancel" });
  });

  it("rejects a second form while the first form owns the shared interaction", async () => {
    let finishFirst: (() => void) | undefined;
    const tui = { terminal: { rows: 40 }, requestRender() {} } as TUI;
    const firstUi: AskUserFormUi = {
      custom: async (factory) =>
        await new Promise((resolve) => {
          const component = factory(tui, {} as never, { matches: () => false } as never, resolve);
          const form = component as Component & { handleInput(data: string): void };
          finishFirst = () => form.handleInput("\u001b");
        }),
    };
    const first = openAskUserForm(questionnaire, { ui: firstUi });

    await expect(openAskUserForm(questionnaire, { ui: firstUi })).rejects.toThrow(
      "another ask_user form is already in flight",
    );
    finishFirst?.();
    await expect(first).resolves.toEqual({ kind: "cancel" });
  });
});
