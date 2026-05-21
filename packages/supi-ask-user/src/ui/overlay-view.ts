import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Editor,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import type { NormalizedChoiceQuestion } from "../types.ts";

export type OverlayAction = "other" | "skip" | "discuss" | "partial";

export type OverlayRow =
  | { kind: "option"; optionIndex: number }
  | { kind: "action"; action: OverlayAction };

export type OverlayMode = "choice" | "text" | "text-input" | "custom-input" | "discuss-input";

export interface RenderOverlayArgs {
  width: number;
  theme: Theme;
  controller: AskUserController;
  mode: OverlayMode;
  selectedIndex: number;
  editor: Editor;
}

export function renderOverlay(args: RenderOverlayArgs): string[] {
  const lines: string[] = [];
  pushLine(lines, args.theme.fg("accent", "─".repeat(args.width)));
  renderHeader(lines, args);
  renderBody(lines, args);
  pushLine(lines, args.theme.fg("dim", footerText(args.controller, args.mode)));
  pushLine(lines, args.theme.fg("accent", "─".repeat(args.width)));
  return lines;
}

export function rowsForCurrentQuestion(controller: AskUserController): OverlayRow[] {
  const question = controller.currentQuestion;
  return question.type === "choice"
    ? rowsForChoiceQuestion(controller, question)
    : rowsForTextQuestion(controller);
}

export function defaultSelectedIndex(controller: AskUserController): number {
  const question = controller.currentQuestion;
  if (question.type === "text") return 0;

  const current = controller.getAnswer(question.id);
  if (current?.kind === "custom") {
    return findActionRowIndex(rowsForChoiceQuestion(controller, question), "other") ?? 0;
  }
  if (current?.kind === "choice") {
    const first = current.selections[0];
    if (!first) return 0;
    const index = question.options.findIndex((option) => option.value === first.value);
    return index >= 0 ? index : 0;
  }
  return question.initialIndexes[0] ?? question.recommendedIndexes[0] ?? 0;
}

export function isEditorMode(mode: OverlayMode): boolean {
  return mode === "text-input" || mode === "custom-input" || mode === "discuss-input";
}

export function footerText(controller: AskUserController, mode: OverlayMode): string {
  const question = controller.currentQuestion;
  if (question.type === "text") {
    if (mode === "text-input") {
      return rowsForTextQuestion(controller).length > 0
        ? "Enter submit • ↓ actions • Esc cancel"
        : "Enter submit • Esc cancel";
    }
    return "↑↓ move • Enter select • ↑ editor • ← back • Esc cancel";
  }
  return question.multi
    ? "↑↓ move • Space toggle • Enter submit • ← back • Esc cancel"
    : "↑↓ move • Space select • Enter submit • ← back • Esc cancel";
}

function renderHeader(lines: string[], args: RenderOverlayArgs): void {
  const { title, intro } = args.controller.questionnaire;
  if (title) pushWrapped(lines, args.width, args.theme.fg("accent", args.theme.bold(title)));
  const progress = `${args.controller.currentIndex + 1}/${args.controller.questions.length} · ${args.controller.currentQuestion.header}`;
  pushWrapped(lines, args.width, args.theme.fg("muted", progress));
  if (intro) {
    pushLine(lines, "");
    pushWrapped(lines, args.width, args.theme.fg("text", intro));
  }
  pushLine(lines, "");
}

function renderBody(lines: string[], args: RenderOverlayArgs): void {
  const question = args.controller.currentQuestion;
  pushWrapped(lines, args.width, args.theme.fg("text", question.prompt));
  pushLine(lines, "");

  if (question.type === "text") {
    renderTextQuestion(lines, args);
  } else if (isEditorMode(args.mode)) {
    renderEditorSection(lines, args);
  } else {
    renderRows(lines, args);
  }

  const preview = previewForSelected(args);
  if (!preview) return;
  pushLine(lines, "");
  pushWrapped(lines, args.width, args.theme.fg("accent", "Preview"));
  pushWrapped(lines, args.width, args.theme.fg("text", preview));
}

function renderTextQuestion(lines: string[], args: RenderOverlayArgs): void {
  renderEditorSection(lines, args);
  const rows = rowsForTextQuestion(args.controller);
  if (rows.length === 0) return;
  pushLine(lines, "");
  renderRows(lines, args);
}

function renderEditorSection(lines: string[], args: RenderOverlayArgs): void {
  const label =
    args.mode === "discuss-input"
      ? "Discuss instead"
      : args.mode === "custom-input"
        ? "Other answer"
        : "Your answer";

  pushWrapped(lines, args.width, args.theme.fg("accent", label));
  for (const line of args.editor.render(Math.max(20, args.width - 2))) {
    pushLine(lines, ` ${truncateToWidth(line, Math.max(1, args.width - 1))}`);
  }

  const question = args.controller.currentQuestion;
  if (question.type === "text" && !args.editor.getText()) {
    if (question.initial) {
      pushWrapped(lines, args.width, args.theme.fg("dim", `Initial: ${question.initial}`));
    } else if (question.placeholder) {
      pushWrapped(lines, args.width, args.theme.fg("dim", `Placeholder: ${question.placeholder}`));
    }
  }
}

function renderRows(lines: string[], args: RenderOverlayArgs): void {
  const rows = rowsForCurrentQuestion(args.controller);
  const question = args.controller.currentQuestion;
  const textActionMode = question.type === "text" && args.mode === "text";

  for (const [index, row] of rows.entries()) {
    const active =
      question.type === "text"
        ? textActionMode && index === args.selectedIndex
        : index === args.selectedIndex;
    const prefix = active ? args.theme.fg("accent", "> ") : "  ";
    addPrefixed(lines, args.width, prefix, args.theme.fg("text", rowLabel(args, row)));

    if (row.kind !== "option" || question.type !== "choice") continue;
    const description = question.options[row.optionIndex]?.description;
    if (description) {
      addPrefixed(lines, args.width, "    ", args.theme.fg("muted", description));
    }
  }
}

function rowLabel(args: RenderOverlayArgs, row: OverlayRow): string {
  const question = args.controller.currentQuestion;
  if (row.kind === "action") return actionLabel(args.controller, row.action);
  if (question.type !== "choice") return "";

  const option = question.options[row.optionIndex];
  if (!option) return "";
  const recommended = question.recommendedIndexes.includes(row.optionIndex) ? " (recommended)" : "";

  if (question.multi) {
    const checked = args.controller.getSelectedIndexes(question).includes(row.optionIndex)
      ? "[x]"
      : "[ ]";
    return `${checked} ${option.label}${recommended}`;
  }

  const selected = args.controller.getSelectedIndexes(question).includes(row.optionIndex);
  const marker = selected ? "(*)" : "( )";
  return `${marker} ${option.label}${recommended}`;
}

function actionLabel(controller: AskUserController, action: OverlayAction): string {
  const question = controller.currentQuestion;
  const answer = controller.getAnswer(question.id);

  switch (action) {
    case "other":
      return answer?.kind === "custom" ? `Other — ${answer.value}` : "Other…";
    case "skip":
      return "Skip question";
    case "discuss":
      return "Discuss instead…";
    case "partial":
      return "Submit partial answers";
  }
}

function previewForSelected(args: RenderOverlayArgs): string | undefined {
  const question = args.controller.currentQuestion;
  if (question.type !== "choice") return undefined;
  const row = rowsForCurrentQuestion(args.controller)[args.selectedIndex];
  return row?.kind === "option" ? question.options[row.optionIndex]?.preview : undefined;
}

function rowsForChoiceQuestion(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
): OverlayRow[] {
  const rows: OverlayRow[] = question.options.map((_option, optionIndex) => ({
    kind: "option",
    optionIndex,
  }));
  if (question.allowOther) rows.push({ kind: "action", action: "other" });
  appendExceptionalActions(rows, controller, question.required);
  return rows;
}

function rowsForTextQuestion(controller: AskUserController): OverlayRow[] {
  const rows: OverlayRow[] = [];
  appendExceptionalActions(rows, controller, controller.currentQuestion.required);
  return rows;
}

function appendExceptionalActions(
  rows: OverlayRow[],
  controller: AskUserController,
  required: boolean,
): void {
  if (!required) rows.push({ kind: "action", action: "skip" });
  if (controller.questionnaire.allowDiscuss) rows.push({ kind: "action", action: "discuss" });
  if (controller.canPartialSubmit()) rows.push({ kind: "action", action: "partial" });
}

function findActionRowIndex(rows: OverlayRow[], action: OverlayAction): number | undefined {
  const index = rows.findIndex((row) => row.kind === "action" && row.action === action);
  return index >= 0 ? index : undefined;
}

function pushLine(lines: string[], text: string): void {
  lines.push(text);
}

function pushWrapped(lines: string[], width: number, text: string): void {
  for (const line of wrapTextWithAnsi(text, Math.max(1, width))) {
    lines.push(truncateToWidth(line, width));
  }
}

function addPrefixed(lines: string[], width: number, prefix: string, text: string): void {
  const available = Math.max(1, width - visibleWidth(prefix));
  const continuation = " ".repeat(visibleWidth(prefix));
  for (const [index, line] of wrapTextWithAnsi(text, available).entries()) {
    lines.push(`${index === 0 ? prefix : continuation}${truncateToWidth(line, available)}`);
  }
}
