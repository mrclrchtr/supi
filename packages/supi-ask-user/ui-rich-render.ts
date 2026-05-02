// Pure rendering helpers for the rich overlay. Kept separate from
// ui-rich.ts to stay within Biome's per-file line limit and so the input
// dispatch logic can be read without scrolling past a wall of theme strings.

import type { Theme } from "@mariozechner/pi-coding-agent";
import { type Editor, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { QuestionnaireFlow } from "./flow.ts";
import { decorateOption, formatReviewLines, NOTE_MARKER } from "./format.ts";
import type { NormalizedStructuredQuestion } from "./types.ts";
import { inlineStructuredRowLines, structuredRowLabel } from "./ui-rich-inline.ts";
import {
  editorCaption,
  padRight,
  renderEditorBlock,
  renderEditorPane,
  usesSeparateEditorPane,
} from "./ui-rich-render-editor.ts";
import { footerHelp } from "./ui-rich-render-footer.ts";
import { currentNote, renderNoteStatus, visibleNoteMarker } from "./ui-rich-render-notes.ts";
import type { OverlayRenderState } from "./ui-rich-render-types.ts";
import {
  hasPreview,
  type InteractiveRow,
  interactiveRows,
  selectedIndexesForQuestion,
} from "./ui-rich-state.ts";

// biome-ignore lint/complexity/useMaxParams: render entry needs full overlay context
export function renderOverlay(
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
): string[] {
  const lines: string[] = [];
  const add = (text: string) => lines.push(truncateToWidth(text, width));
  add(theme.fg("accent", "─".repeat(width)));
  if (flow.isMultiQuestion) renderTabBar(add, theme, flow);
  if (flow.currentMode === "reviewing") {
    renderReview(add, width, theme, flow);
  } else {
    renderQuestion(add, lines, width, theme, flow, state, editor);
  }
  add(theme.fg("dim", ` ${footerHelp(flow, state)}`));
  add(theme.fg("accent", "─".repeat(width)));
  return lines;
}

function tabSegment(
  theme: Theme,
  text: string,
  active: boolean,
  color: "success" | "muted" | "dim" | "text",
): string {
  return active ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg(color, text);
}

function renderTabBar(add: (text: string) => void, theme: Theme, flow: QuestionnaireFlow): void {
  // Active segment uses the selected-bg highlight (matches pi's reference
  // questionnaire and Claude's UI). Inactive segments stay foreground-only:
  // success when answered, muted when pending, dim when optional and skipped.
  const segments: string[] = [theme.fg("dim", "← ")];
  for (const [index, question] of flow.questions.entries()) {
    const answered = flow.hasAnswer(question.id);
    const active = flow.currentMode === "answering" && flow.currentIndex === index;
    const marker = answered ? "■" : question.required ? "□" : "○";
    const color = answered ? "success" : question.required ? "muted" : "dim";
    segments.push(tabSegment(theme, ` ${marker} ${question.header} `, active, color));
    segments.push(" ");
  }
  const reviewActive = flow.currentMode === "reviewing";
  segments.push(tabSegment(theme, " ✓ Review ", reviewActive, reviewActive ? "text" : "dim"));
  segments.push(theme.fg("dim", " →"));
  add(` ${segments.join("")}`);
  add("");
}

// biome-ignore lint/complexity/useMaxParams: question render needs full context
function renderQuestion(
  add: (text: string) => void,
  lines: string[],
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
): void {
  const question = flow.currentQuestion;
  if (!question) return;
  for (const line of wrapTextWithAnsi(` ${question.prompt}`, width)) {
    add(theme.fg("text", line));
  }
  lines.push("");
  if (question.type === "text") {
    renderTextQuestion(add, lines, theme, editor, width);
    return;
  }
  renderStructuredQuestion(add, lines, width, theme, flow, state, editor, question);
}

// biome-ignore lint/complexity/useMaxParams: split view layout needs full context
function renderSplitView(
  lines: string[],
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): void {
  const leftWidth = Math.max(34, Math.floor(width * 0.42));
  const rightWidth = Math.max(24, width - leftWidth - 3);
  const leftLines = renderPaneRows(leftWidth, theme, flow, state, editor, question, rows);
  const rightLines = usesSeparateEditorPane(state)
    ? renderEditorPane(rightWidth, theme, editor, editorCaption(state))
    : renderPreviewPane(
        rightWidth,
        theme,
        previewForSelection(question, rows[state.selectedIndex]),
      );
  const total = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < total; index += 1) {
    const left = padRight(leftLines[index] ?? "", leftWidth);
    const right = padRight(rightLines[index] ?? "", rightWidth);
    lines.push(`${left} ${theme.fg("accent", "│")} ${right}`);
  }
}

// biome-ignore lint/complexity/useMaxParams: thin adapter for text question rendering
function renderTextQuestion(
  add: (text: string) => void,
  lines: string[],
  theme: Theme,
  editor: Editor,
  width: number,
): void {
  renderEditorBlock(add, lines, theme, editor, width, "Answer");
}

// biome-ignore lint/complexity/useMaxParams: structured render needs full context
function renderStructuredQuestion(
  add: (text: string) => void,
  lines: string[],
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
  question: NormalizedStructuredQuestion,
): void {
  const rows = interactiveRows(question);
  if (hasPreview(question) && width >= 100) {
    renderSplitView(lines, width, theme, flow, state, editor, question, rows);
  } else {
    renderStandardStructuredQuestion(add, lines, width, theme, flow, state, editor, question, rows);
  }
  const note = currentNote(flow, state, question);
  if (note) renderNoteStatus(add, theme, note);
}

// biome-ignore lint/complexity/useMaxParams: standard layout needs full context
function renderStandardStructuredQuestion(
  add: (text: string) => void,
  lines: string[],
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): void {
  renderRows(add, width, theme, flow, state, editor, question, rows);
  if (usesSeparateEditorPane(state)) {
    renderEditorBlock(add, lines, theme, editor, width, editorCaption(state));
    return;
  }
  const preview = previewForSelection(question, rows[state.selectedIndex]);
  if (preview) renderPreviewBlock(add, lines, theme, width, preview);
}

// biome-ignore lint/complexity/useMaxParams: helper mirrors render context
function renderPaneRows(
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): string[] {
  const out: string[] = [];
  const push = (text = "") => out.push(truncateToWidth(text, width));
  renderRows(push, width, theme, flow, state, editor, question, rows);
  return out;
}

// biome-ignore lint/complexity/useMaxParams: helper mirrors render context
function renderRows(
  add: (text: string) => void,
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): void {
  const selected = selectedIndexesForQuestion(flow, state, question);
  for (const [index, row] of rows.entries()) {
    const active = state.selectedIndex === index;
    const prefix = active ? theme.fg("accent", "> ") : "  ";
    const inlineEditorLines = inlineStructuredRowLines({
      width,
      theme,
      state,
      editor,
      row,
      prefix,
    });
    if (inlineEditorLines) {
      const rowContinuation = " ".repeat(visibleWidth(prefix));
      for (const [lineIndex, line] of inlineEditorLines.entries()) {
        add(`${lineIndex === 0 ? prefix : rowContinuation}${line}`);
      }
      continue;
    }
    addWrapped(add, width, prefix, rowLabel(theme, flow, state, question, row, active, selected));
    const description = rowDescription(question, row);
    if (description) addWrapped(add, width, "     ", theme.fg("muted", description));
  }
}

// biome-ignore lint/complexity/useMaxParams: helper mirrors render context
function rowLabel(
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  question: NormalizedStructuredQuestion,
  row: InteractiveRow,
  active: boolean,
  selected: number[],
): string {
  if (row.kind === "option") {
    const option = question.options[row.optionIndex];
    const recommended = question.recommendedIndexes.includes(row.optionIndex);
    const noteMarker = visibleNoteMarker({ flow, state, question, row, active });
    const baseLabel = `${decorateOption(option.label, recommended)}${noteMarker ? ` ${NOTE_MARKER}` : ""}`;
    if (question.type === "multichoice") {
      const checked = selected.includes(row.optionIndex) ? "[x]" : "[ ]";
      return theme.fg("text", `${checked} ${baseLabel}`);
    }
    return theme.fg("text", `${row.optionIndex + 1}. ${baseLabel}`);
  }
  if (row.kind === "other") return theme.fg("text", structuredRowLabel(flow, question, row));
  return theme.fg("text", structuredRowLabel(flow, question, row));
}

function rowDescription(
  question: NormalizedStructuredQuestion,
  row: InteractiveRow,
): string | undefined {
  if (row.kind === "option") return question.options[row.optionIndex].description;
  return undefined;
}

function renderPreviewPane(width: number, theme: Theme, preview: string | undefined): string[] {
  const out: string[] = [];
  const push = (text = "") => out.push(truncateToWidth(text, width));
  push(theme.fg("accent", " Preview"));
  push("");
  if (!preview) {
    push(theme.fg("muted", " No preview for the current selection."));
    return out;
  }
  for (const line of preview.split("\n")) push(theme.fg("text", ` ${line}`));
  return out;
}

// biome-ignore lint/complexity/useMaxParams: helper mirrors render context
function renderPreviewBlock(
  add: (text: string) => void,
  lines: string[],
  theme: Theme,
  width: number,
  preview: string,
): void {
  add("");
  add(theme.fg("accent", " Preview:"));
  for (const line of preview.split("\n")) {
    lines.push(truncateToWidth(` ${line}`, width));
  }
}

function previewForSelection(
  question: NormalizedStructuredQuestion,
  row: InteractiveRow | undefined,
): string | undefined {
  return row?.kind === "option" ? question.options[row.optionIndex].preview : undefined;
}

function renderReview(
  add: (text: string) => void,
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
): void {
  add(theme.fg("accent", " Review answers:"));
  add("");
  for (const question of flow.questions) {
    const answer = flow.getAnswer(question.id);
    const lines = answer
      ? formatReviewLines(question, answer)
      : [question.required ? "(no answer)" : "(skipped)"];
    add(theme.fg("muted", ` ${question.header}:`));
    for (const line of lines) addWrapped(add, width, "   ", theme.fg("text", line));
  }
  add("");
  if (flow.showSkip) {
    add(
      theme.fg(
        flow.allRequiredAnswered() ? "success" : "warning",
        " Press Enter to submit • s to skip",
      ),
    );
  } else {
    add(theme.fg(flow.allRequiredAnswered() ? "success" : "warning", " Press Enter to submit"));
  }
}

function addWrapped(
  add: (text: string) => void,
  width: number,
  prefix: string,
  text: string,
): void {
  const prefixWidth = visibleWidth(prefix);
  const contentWidth = Math.max(1, width - prefixWidth);
  const continuationPrefix = " ".repeat(prefixWidth);
  for (const [index, line] of wrapTextWithAnsi(text, contentWidth).entries()) {
    add(`${index === 0 ? prefix : continuationPrefix}${line}`);
  }
}
