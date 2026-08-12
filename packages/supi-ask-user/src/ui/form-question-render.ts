import type { Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { NormalizedChoiceQuestion } from "../types.ts";
import type { RenderFormFrameArgs } from "./form-render.ts";
import {
  padRight,
  pushWrappedWithPrefix,
  renderMiniBox,
  renderPrompt,
  safeWidth,
} from "./form-render-primitives.ts";
import {
  type FormLineRange,
  offsetFormLineRange,
  type RenderedFormSection,
} from "./form-viewport.ts";

export function renderChoiceScreen(args: RenderFormFrameArgs): RenderedFormSection {
  const lines: string[] = [];
  const question = args.controller.currentQuestion;

  if (question.type !== "choice") return { lines };

  lines.push(...renderPrompt(question.prompt, args.width));
  if (args.controller.isQuestionMarkedUnanswered(question.id)) {
    lines.push("");
    lines.push(args.theme.fg("warning", "Marked unanswered; comments preserved."));
  }
  lines.push("");

  if (args.detailsText && args.width >= 80) {
    const section = renderChoiceWithDetails(args, question);
    const focusedRange = offsetFormLineRange(section.focusedRange, lines.length);
    lines.push(...section.lines);
    return { lines, focusedRange };
  }

  let focusedRange: FormLineRange | undefined;
  for (let i = 0; i < question.options.length; i += 1) {
    const start = lines.length;
    lines.push(...renderChoiceOptionLines(args, question, i, args.width));
    if (i === args.choiceFocusIndex) focusedRange = { start, end: lines.length };
  }

  if (args.detailsText) {
    lines.push("");
    lines.push(...renderDetailsCard(args.theme, args.detailsText, args.width));
  }

  return { lines, focusedRange };
}

function renderChoiceWithDetails(
  args: RenderFormFrameArgs,
  question: NormalizedChoiceQuestion,
): RenderedFormSection {
  const gap = 2;
  const divider = args.theme.fg("borderMuted", "│");
  const dividerWidth = 1;
  const minLeftWidth = 28;
  const preferredDetailsWidth = Math.max(30, Math.floor(args.width * 0.38));
  const rightWidth = Math.max(
    22,
    Math.min(preferredDetailsWidth, args.width - gap - dividerWidth - gap - minLeftWidth),
  );
  const leftWidth = Math.max(1, args.width - gap - dividerWidth - gap - rightWidth);

  const optionLines: string[] = [];
  let focusedRange: FormLineRange | undefined;
  for (let i = 0; i < question.options.length; i += 1) {
    const start = optionLines.length;
    optionLines.push(...renderChoiceOptionLines(args, question, i, leftWidth));
    if (i === args.choiceFocusIndex) focusedRange = { start, end: optionLines.length };
  }

  const detailsLines = renderDetailsCard(args.theme, args.detailsText ?? "", rightWidth);
  const merged: string[] = [];
  const maxRows = Math.max(optionLines.length, detailsLines.length);
  for (let i = 0; i < maxRows; i += 1) {
    const left = optionLines[i] ?? "";
    const right = detailsLines[i] ?? "";
    const mergedLine = `${padRight(left, leftWidth)}${" ".repeat(gap)}${divider}${" ".repeat(gap)}${right}`;
    merged.push(truncateToWidth(mergedLine, args.width));
  }

  return { lines: merged, focusedRange };
}

function renderChoiceOptionLines(
  args: RenderFormFrameArgs,
  question: NormalizedChoiceQuestion,
  optionIndex: number,
  width: number,
): string[] {
  const lines: string[] = [];
  const opt = question.options[optionIndex];
  const focused = optionIndex === args.choiceFocusIndex;
  const selected = args.controller.isOptionSelected(question.id, opt.value);
  const hasComment = !!args.controller.getOptionComment(question.id, opt.value);

  const marker = choiceMarker(question.multi, selected);
  const isRecommended = question.recommendedIndexes.includes(optionIndex);
  const prefix = focused ? "  → " : "    ";
  const label = `${marker} ${opt.label}${isRecommended ? " [recommended]" : ""}${hasComment ? " [comment]" : ""}`;
  pushWrappedWithPrefix({
    lines,
    prefix,
    text: focused ? args.theme.fg("accent", label) : label,
    width,
  });

  if (opt.description) {
    pushWrappedWithPrefix({
      lines,
      prefix: "       ",
      text: args.theme.fg("muted", opt.description),
      width,
    });
  }

  return lines;
}

function choiceMarker(multi: boolean, selected: boolean): string {
  if (multi) return selected ? "[x]" : "[ ]";
  return selected ? "(*)" : "( )";
}

export function renderTextScreen(args: RenderFormFrameArgs): RenderedFormSection {
  const lines: string[] = [];
  const question = args.controller.currentQuestion;

  if (question.type !== "text") return { lines };

  lines.push(...renderPrompt(question.prompt, args.width));
  lines.push("");
  lines.push(args.theme.fg("accent", "Your answer"));
  const editorStart = lines.length;
  const editorLines = args.editor.render(safeWidth(args.width));
  lines.push(...editorLines);
  const focusedRange = editorFocusRange(editorLines, editorStart);

  if (question.placeholder && !args.editor.getText()) {
    lines.push("");
    lines.push(
      ...wrapTextWithAnsi(args.theme.fg("dim", `Placeholder: ${question.placeholder}`), args.width),
    );
  }

  return { lines, focusedRange };
}

export function renderEditorScreen(args: RenderFormFrameArgs): RenderedFormSection {
  const lines: string[] = [];
  const label = args.editorLabel ?? "Editor";
  const title = args.editorContext ? `${label}: ${args.editorContext}` : label;
  lines.push(args.theme.fg("accent", title));
  const editorStart = lines.length;
  const editorLines = args.editor.render(safeWidth(args.width));
  lines.push(...editorLines);
  return { lines, focusedRange: editorFocusRange(editorLines, editorStart) };
}

function editorFocusRange(editorLines: string[], start: number): FormLineRange {
  const cursorLine = editorLines.findIndex((line) => line.includes(CURSOR_MARKER));
  if (cursorLine >= 0) return { start: start + cursorLine, end: start + cursorLine + 1 };
  return { start, end: start + 1 };
}

function renderDetailsCard(theme: Theme, detailsText: string, width: number): string[] {
  const innerWidth = Math.max(1, safeWidth(width) - 4);
  return renderMiniBox(theme, "Details", renderPrompt(detailsText, innerWidth), width);
}
