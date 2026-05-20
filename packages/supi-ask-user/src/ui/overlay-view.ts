import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Editor,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import type { NormalizedChoiceQuestion } from "../types.ts";

export interface ChoiceRow {
  kind: "option" | "other" | "continue";
  optionIndex?: number;
}

export type OverlayMode = "choice" | "text" | "custom" | "discuss";

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

export function rowsForQuestion(question: NormalizedChoiceQuestion): ChoiceRow[] {
  const rows: ChoiceRow[] = question.options.map((_option, optionIndex) => ({
    kind: "option",
    optionIndex,
  }));
  if (question.allowOther) rows.push({ kind: "other" });
  if (question.multi) rows.push({ kind: "continue" });
  return rows;
}

export function defaultSelectedIndex(
  controller: AskUserController,
  question: NormalizedChoiceQuestion,
): number {
  const current = controller.getAnswer(question.id);
  if (current?.kind === "custom") return question.options.length;
  if (current?.kind === "choice") {
    const first = current.selections[0];
    if (!first) return 0;
    const index = question.options.findIndex((option) => option.value === first.value);
    return index >= 0 ? index : 0;
  }
  return question.initialIndexes[0] ?? question.recommendedIndexes[0] ?? 0;
}

export function footerText(controller: AskUserController, mode: OverlayMode): string {
  const base = isEditorMode(mode)
    ? "Enter submit • Esc back"
    : controller.currentQuestion.type === "choice" && controller.currentQuestion.multi
      ? "↑↓ move • Space toggle • Enter continue • ← back • Esc cancel"
      : "↑↓ move • Enter select • ← back • Esc cancel";

  const extras: string[] = [];
  if (controller.questionnaire.allowDiscuss) extras.push("Ctrl-G discuss");
  if (controller.canPartialSubmit()) extras.push("Ctrl-P partial");
  return extras.length > 0 ? `${base} • ${extras.join(" • ")}` : base;
}

export function isEditorMode(mode: OverlayMode): boolean {
  return mode === "text" || mode === "custom" || mode === "discuss";
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

  if (question.type === "text" || (isEditorMode(args.mode) && args.mode !== "choice")) {
    renderEditorSection(lines, args);
    return;
  }

  renderChoiceRows(lines, args);
  const preview = previewForSelected(args);
  if (!preview) return;
  pushLine(lines, "");
  pushWrapped(lines, args.width, args.theme.fg("accent", "Preview"));
  pushWrapped(lines, args.width, args.theme.fg("text", preview));
}

function renderEditorSection(lines: string[], args: RenderOverlayArgs): void {
  const question = args.controller.currentQuestion;
  const label =
    args.mode === "discuss"
      ? "Discuss instead"
      : args.mode === "custom"
        ? "Other answer"
        : "Your answer";

  pushWrapped(lines, args.width, args.theme.fg("accent", label));
  for (const line of args.editor.render(Math.max(20, args.width - 2))) {
    pushLine(lines, ` ${truncateToWidth(line, Math.max(1, args.width - 1))}`);
  }
  if (question.type === "text" && question.placeholder && !args.editor.getText()) {
    pushWrapped(lines, args.width, args.theme.fg("dim", `Placeholder: ${question.placeholder}`));
  }
}

function renderChoiceRows(lines: string[], args: RenderOverlayArgs): void {
  const question = args.controller.currentQuestion;
  if (question.type !== "choice") return;

  const rows = rowsForQuestion(question);
  for (const [index, row] of rows.entries()) {
    const active = index === args.selectedIndex;
    const prefix = active ? args.theme.fg("accent", "> ") : "  ";
    addPrefixed(lines, args.width, prefix, args.theme.fg("text", rowLabel(args, question, row)));
    const description = rowDescription(question, row);
    if (description) addPrefixed(lines, args.width, "    ", args.theme.fg("muted", description));
  }
}

function rowLabel(
  args: RenderOverlayArgs,
  question: NormalizedChoiceQuestion,
  row: ChoiceRow,
): string {
  if (row.kind === "other") return "Other…";
  if (row.kind === "continue") return "Continue";

  const option = optionForRow(question, row);
  const recommended = question.recommendedIndexes.includes(row.optionIndex ?? -1)
    ? " (recommended)"
    : "";

  if (!question.multi) return `${(row.optionIndex ?? 0) + 1}. ${option.label}${recommended}`;
  const checked = args.controller.getSelectedIndexes(question).includes(row.optionIndex ?? -1)
    ? "[x]"
    : "[ ]";
  return `${checked} ${option.label}${recommended}`;
}

function rowDescription(question: NormalizedChoiceQuestion, row: ChoiceRow): string | undefined {
  if (row.kind !== "option") return undefined;
  return optionForRow(question, row).description;
}

function previewForSelected(args: RenderOverlayArgs): string | undefined {
  const question = args.controller.currentQuestion;
  if (question.type !== "choice") return undefined;
  const row = rowsForQuestion(question)[args.selectedIndex];
  return row?.kind === "option" ? optionForRow(question, row).preview : undefined;
}

function optionForRow(question: NormalizedChoiceQuestion, row: ChoiceRow) {
  const option = row.optionIndex !== undefined ? question.options[row.optionIndex] : undefined;
  if (!option) {
    throw new Error(`Invalid option row for question "${question.id}".`);
  }
  return option;
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
