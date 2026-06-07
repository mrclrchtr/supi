import type { Theme } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import type { NormalizedChoiceQuestion } from "../types.ts";

export type OverlayAction = "other" | "skip" | "discuss" | "partial";
export type FocusTarget = "choices" | "editor" | "actions";
export type OverlayMode = "choice" | "text" | "custom-input" | "discuss-input" | "note-input";

export type ChoiceRow =
  | { kind: "option"; optionIndex: number }
  | { kind: "action"; action: OverlayAction };

export function buildChoiceRows(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
): ChoiceRow[] {
  const rows: ChoiceRow[] = question.options.map((_option, optionIndex) => ({
    kind: "option",
    optionIndex,
  }));
  if (question.allowOther) rows.push({ kind: "action", action: "other" });
  rows.push(
    ...buildExceptionalActions(controller, question.required).map((action) => ({
      kind: "action" as const,
      action,
    })),
  );
  return rows;
}

export function buildChoiceItems(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
  rows: ChoiceRow[],
): SelectItem[] {
  const selectedIndexes = new Set(controller.getSelectedIndexes(question));
  return rows.flatMap((row) => {
    if (row.kind === "option") {
      const option = question.options[row.optionIndex];
      return option
        ? [
            buildOptionItem({
              question,
              optionIndex: row.optionIndex,
              label: option.label,
              selectedIndexes,
              hasNote: !!controller.getChoiceOptionNote(question.id, option.value),
            }),
          ]
        : [];
    }
    return [buildActionItem(controller, question.id, row.action)];
  });
}

export function buildTextActionItems(
  controller: AskUserController,
): Array<{ action: OverlayAction; item: SelectItem }> {
  return buildExceptionalActions(controller, controller.currentQuestion.required).map((action) => ({
    action,
    item: {
      value: action,
      label: actionLabel(action),
    },
  }));
}

export function defaultChoiceRowIndex(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
  rows: ChoiceRow[],
): number {
  const current = controller.getAnswer(question.id);
  if (current?.kind === "custom") {
    return rows.findIndex((row) => row.kind === "action" && row.action === "other");
  }
  if (current?.kind === "choice") {
    const first = current.selections[0];
    if (!first) return 0;
    const optionIndex = question.options.findIndex((option) => option.value === first.value);
    return optionIndex >= 0 ? optionIndex : 0;
  }
  return question.initialIndexes[0] ?? question.recommendedIndexes[0] ?? 0;
}

export function previewOptionIndexForRows(
  rows: ChoiceRow[],
  rowIndex: number,
  fallbackOptionIndex: number,
): number | undefined {
  const row = rows[rowIndex];
  if (row?.kind === "option") return row.optionIndex;
  return fallbackOptionIndex >= 0 ? fallbackOptionIndex : undefined;
}

export function footerText(args: {
  controller: AskUserController;
  mode: OverlayMode;
  focus: FocusTarget;
  hasTextActions: boolean;
}): string {
  const { controller, mode, focus, hasTextActions } = args;
  const question = controller.currentQuestion;

  if (question.type === "text") {
    if (mode === "discuss-input") return "Enter submit • Esc cancel";
    if (focus === "editor") {
      return hasTextActions
        ? "Enter submit • ↓ actions • ← back • Esc cancel"
        : "Enter submit • ← back • Esc cancel";
    }
    return "↑↓ move • Enter select • ↑ editor • ← back • Esc cancel";
  }

  if (mode === "custom-input" || mode === "discuss-input") {
    return "Enter submit • Esc cancel";
  }
  if (mode === "note-input") {
    return "Enter save • Esc close";
  }
  return question.multi
    ? "↑↓ move • Space toggle • Enter submit • n note • ← back • Esc cancel"
    : "↑↓ move • Space select • Enter submit • n note • ← back • Esc cancel";
}

export function splitColumns(args: {
  width: number;
  theme: Theme;
  leftLines: string[];
  rightLines: string[];
  leftRatio?: number;
}): string[] {
  const { width, theme, leftLines, rightLines, leftRatio = 0.55 } = args;
  const leftWidth = Math.max(36, Math.floor(width * leftRatio));
  const rightWidth = Math.max(24, width - leftWidth - 3);
  const total = Math.max(leftLines.length, rightLines.length);
  const lines: string[] = [];

  for (let index = 0; index < total; index += 1) {
    const left = padRight(leftLines[index] ?? "", leftWidth);
    const right = padRight(rightLines[index] ?? "", rightWidth);
    lines.push(`${left} ${theme.fg("accent", "│")} ${right}`);
  }
  return lines;
}

export function choiceRowValue(row: ChoiceRow): string {
  return row.kind === "option" ? `option:${row.optionIndex}` : `action:${row.action}`;
}

export function noteTargetLabel(
  controller: AskUserController,
  choiceRows: ChoiceRow[],
  choiceRowIndex: number,
): string | undefined {
  const question = controller.currentQuestion;
  if (question.type !== "choice") return undefined;
  const row = choiceRows[choiceRowIndex];
  if (row?.kind !== "option") return undefined;
  return question.options[row.optionIndex]?.label;
}

function renderOptionRow(args: {
  option: { label: string; description?: string };
  labelText: string;
  hasNote: boolean;
  isSelected: boolean;
  theme: Theme;
  width: number;
}): string[] {
  const { theme, isSelected, labelText, hasNote, width, option } = args;
  const prefix = isSelected ? "\u2192 " : "  ";
  const baseText = isSelected
    ? theme.fg("accent", `${prefix}${labelText}`)
    : `${prefix}${labelText}`;
  const noteSuffix = hasNote ? ` ${theme.fg("accent", "[note]")}` : "";

  const lines: string[] = wrapTextWithAnsi(`${baseText}${noteSuffix}`, width);

  if (option.description) {
    const descWidth = Math.max(10, width - 2);
    const wrapped = wrapTextWithAnsi(option.description, descWidth);
    for (const descLine of wrapped) {
      lines.push(theme.fg("muted", `  ${descLine}`));
    }
  }

  return lines;
}

function renderActionRow(args: {
  actionLabel: string;
  isSelected: boolean;
  theme: Theme;
}): string[] {
  const { theme, isSelected, actionLabel } = args;
  const prefix = isSelected ? "\u2192 " : "  ";
  return [isSelected ? theme.fg("accent", `${prefix}${actionLabel}`) : `${prefix}${actionLabel}`];
}

function prepareOptionMarker(
  question: NormalizedChoiceQuestion,
  optionIndex: number,
  selectedIndexes: Set<number>,
): string {
  if (question.multi) {
    return selectedIndexes.has(optionIndex) ? "[x]" : "[ ]";
  }
  return selectedIndexes.has(optionIndex) ? "(*)" : "( )";
}

function prepareOptionLabel(
  option: { label: string },
  marker: string,
  recommended: boolean,
): string {
  return `${marker} ${option.label}${recommended ? " (recommended)" : ""}`;
}

export function renderChoiceList(args: {
  controller: AskUserController;
  question: NormalizedChoiceQuestion;
  rows: ChoiceRow[];
  selectedIndex: number;
  theme: Theme;
  width: number;
}): string[] {
  const { controller, question, rows, selectedIndex, theme, width } = args;
  const lines: string[] = [];
  const selectedIndexes = new Set(controller.getSelectedIndexes(question));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isSelected = i === selectedIndex;

    if (row.kind === "option") {
      const option = question.options[row.optionIndex];
      if (!option) continue;

      const marker = prepareOptionMarker(question, row.optionIndex, selectedIndexes);
      const recommended = question.recommendedIndexes.includes(row.optionIndex);
      const hasNote = !!controller.getChoiceOptionNote(question.id, option.value);
      const labelText = prepareOptionLabel(option, marker, recommended);

      lines.push(...renderOptionRow({ option, labelText, hasNote, isSelected, theme, width }));
    } else {
      const answer = controller.getAnswer(question.id);
      const actionLabelText =
        row.action === "other" && answer?.kind === "custom"
          ? `Other \u2014 ${answer.value}`
          : actionLabel(row.action);

      lines.push(...renderActionRow({ actionLabel: actionLabelText, isSelected, theme }));
    }
  }

  return lines;
}

function buildOptionItem(args: {
  question: NormalizedChoiceQuestion;
  optionIndex: number;
  label: string;
  selectedIndexes: Set<number>;
  hasNote: boolean;
}): SelectItem {
  const { question, optionIndex, label, selectedIndexes, hasNote } = args;
  const recommended = question.recommendedIndexes.includes(optionIndex) ? " (recommended)" : "";
  const marker = question.multi
    ? selectedIndexes.has(optionIndex)
      ? "[x]"
      : "[ ]"
    : selectedIndexes.has(optionIndex)
      ? "(*)"
      : "( )";
  return {
    value: choiceRowValue({ kind: "option", optionIndex }),
    label: `${marker} ${label}${recommended}${hasNote ? " [note]" : ""}`,
  };
}

function buildActionItem(
  controller: AskUserController,
  questionId: string,
  action: OverlayAction,
): SelectItem {
  const answer = controller.getAnswer(questionId);
  return {
    value: choiceRowValue({ kind: "action", action }),
    label:
      action === "other" && answer?.kind === "custom"
        ? `Other — ${answer.value}`
        : actionLabel(action),
  };
}

function buildExceptionalActions(
  controller: AskUserController,
  required: boolean,
): OverlayAction[] {
  const actions: OverlayAction[] = [];
  if (!required) actions.push("skip");
  actions.push("discuss");
  if (controller.canPartialSubmit()) actions.push("partial");
  return actions;
}

function actionLabel(action: OverlayAction): string {
  switch (action) {
    case "other":
      return "Other…";
    case "skip":
      return "Skip question";
    case "discuss":
      return "Discuss instead…";
    case "partial":
      return "Submit partial answers";
  }
}

function padRight(text: string, width: number): string {
  const visible = visibleWidth(text);
  if (visible >= width) return truncateToWidth(text, width);
  return `${text}${" ".repeat(width - visible)}`;
}
