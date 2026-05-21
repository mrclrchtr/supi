import { AskUserController } from "../session/controller.ts";
import type {
  AnswerSelection,
  AskUserOutcome,
  NormalizedChoiceQuestion,
  NormalizedQuestionnaire,
  NormalizedTextQuestion,
} from "../types.ts";
import type { AskUserUiContext } from "./types.ts";

export interface RunDialogOptions {
  ui: AskUserUiContext;
  signal?: AbortSignal;
}

export async function runDialogQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  opts: RunDialogOptions,
): Promise<AskUserOutcome> {
  const controller = new AskUserController(questionnaire);
  while (!controller.isTerminal) {
    if (syncAbort(controller, opts.signal)) break;
    const question = controller.currentQuestion;
    if (question.type === "choice") {
      await runChoiceQuestion(controller, question, opts);
    } else {
      await runTextQuestion(controller, question, opts);
    }
  }
  return controller.outcome();
}

async function runChoiceQuestion(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
  opts: RunDialogOptions,
): Promise<void> {
  if (question.multi) {
    await runMultiChoiceQuestion(controller, question, opts);
    return;
  }

  const actions = new Map<string, () => Promise<void>>();
  const options = question.options.map((option, index) => {
    const label = `${index + 1}. ${option.label}${option.description ? ` — ${option.description}` : ""}`;
    actions.set(label, async () => {
      controller.setAnswer(question.id, {
        kind: "choice",
        selections: [toSelection(option)],
      });
      advanceAfterQuestion(controller);
    });
    return label;
  });

  if (question.allowOther) {
    const otherLabel = "Other…";
    actions.set(otherLabel, async () => {
      const value = await opts.ui.input?.(
        dialogTitle(controller, question),
        "Enter a custom answer",
      );
      if (value === undefined) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      controller.setAnswer(question.id, { kind: "custom", value: trimmed });
      advanceAfterQuestion(controller);
    });
    options.push(otherLabel);
  }

  appendSharedActions({ actions, options, controller, question, opts });
  const selected = await opts.ui.select?.(dialogTitle(controller, question), options);
  if (selected === undefined) {
    controller.cancel();
    return;
  }
  await actions.get(selected)?.();
}

async function runMultiChoiceQuestion(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
  opts: RunDialogOptions,
): Promise<void> {
  while (!controller.isTerminal) {
    if (syncAbort(controller, opts.signal)) return;
    const selectedIndexes = new Set(controller.getSelectedIndexes(question));
    const actions = new Map<string, () => Promise<void>>();
    const options = question.options.map((option, index) => {
      const checked = selectedIndexes.has(index) ? "[x]" : "[ ]";
      const label = `${checked} ${option.label}${option.description ? ` — ${option.description}` : ""}`;
      actions.set(label, async () => {
        if (selectedIndexes.has(index)) selectedIndexes.delete(index);
        else selectedIndexes.add(index);
        const selections = [...selectedIndexes]
          .sort((left, right) => left - right)
          .map((optionIndex) => toSelection(resolveOption(question, optionIndex)));
        if (selections.length > 0) {
          controller.setAnswer(question.id, { kind: "choice", selections });
        } else {
          controller.clearAnswer(question.id);
        }
      });
      return label;
    });

    const doneLabel = "Done";
    actions.set(doneLabel, async () => {
      if (controller.hasAnswer(question.id) || !question.required) {
        advanceAfterQuestion(controller);
      } else {
        opts.ui.notify?.("Select at least one option before continuing.", "warning");
      }
    });
    options.push(doneLabel);
    appendSharedActions({ actions, options, controller, question, opts });

    const selected = await opts.ui.select?.(dialogTitle(controller, question), options);
    if (selected === undefined) {
      controller.cancel();
      return;
    }
    const before = controller.currentIndex;
    await actions.get(selected)?.();
    if (controller.isTerminal || controller.currentIndex !== before) return;
  }
}

async function runTextQuestion(
  controller: AskUserController,
  question: NormalizedTextQuestion,
  opts: RunDialogOptions,
): Promise<void> {
  while (!controller.isTerminal) {
    const options = ["Edit response"];
    const actions = new Map<string, () => Promise<void>>();
    actions.set("Edit response", async () => {
      const current = controller.getAnswer(question.id);
      const prefill = current?.kind === "text" ? current.value : (question.initial ?? "");
      const value = await opts.ui.editor?.(dialogTitle(controller, question), prefill);
      if (value === undefined) return;
      const trimmed = value.trim();
      if (!trimmed) {
        if (question.required) return;
        controller.clearAnswer(question.id);
        advanceAfterQuestion(controller);
        return;
      }
      controller.setAnswer(question.id, { kind: "text", value: trimmed });
      advanceAfterQuestion(controller);
    });

    appendSharedActions({ actions, options, controller, question, opts });
    const selected = await opts.ui.select?.(dialogTitle(controller, question), options);
    if (selected === undefined) {
      controller.cancel();
      return;
    }
    const before = controller.currentIndex;
    await actions.get(selected)?.();
    if (controller.isTerminal || controller.currentIndex !== before) return;
  }
}

function appendSharedActions(args: {
  actions: Map<string, () => Promise<void>>;
  options: string[];
  controller: AskUserController;
  question: { id: string; required: boolean };
  opts: RunDialogOptions;
}): void {
  const { actions, options, controller, question, opts } = args;
  if (!question.required) {
    const skipLabel = "Skip question";
    actions.set(skipLabel, async () => {
      controller.clearAnswer(question.id);
      advanceAfterQuestion(controller);
    });
    options.push(skipLabel);
  }

  if (controller.questionnaire.allowDiscuss) {
    const discussLabel = "Discuss instead…";
    actions.set(discussLabel, async () => {
      const value = await opts.ui.input?.(
        dialogTitle(controller, controller.currentQuestion),
        "Optional message",
      );
      controller.finishDiscuss(value);
    });
    options.push(discussLabel);
  }

  if (controller.canPartialSubmit()) {
    const partialLabel = "Submit partial answers";
    actions.set(partialLabel, async () => {
      controller.finishPartial();
    });
    options.push(partialLabel);
  }
}

function advanceAfterQuestion(controller: AskUserController): void {
  if (!controller.goNext()) {
    controller.finishSubmitted();
  }
}

function dialogTitle(
  controller: AskUserController,
  question: { header: string; prompt: string },
): string {
  const parts = [
    controller.questionnaire.title,
    controller.questionnaire.intro,
    `${controller.currentIndex + 1}/${controller.questions.length} · ${question.header}`,
    question.prompt,
  ].filter(Boolean);
  return parts.join("\n\n");
}

function syncAbort(controller: AskUserController, signal: AbortSignal | undefined): boolean {
  if (!signal?.aborted) return false;
  controller.abort();
  return true;
}

function toSelection(option: { value: string; label: string }): AnswerSelection {
  return { value: option.value, label: option.label };
}

function resolveOption(question: NormalizedChoiceQuestion, optionIndex: number) {
  const option = question.options[optionIndex];
  if (!option) {
    throw new Error(`Invalid option index for question "${question.id}".`);
  }
  return option;
}
