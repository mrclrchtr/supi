// Pure rendering helpers for the rich overlay. Kept separate from
// ui-rich.ts to stay within Biome's per-file line limit and so the input
// dispatch logic can be read without scrolling past a wall of theme strings.

import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
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
import type { RenderEnv } from "./ui-rich-render-env.ts";
import { footerHelp } from "./ui-rich-render-footer.ts";
import { currentNote, renderNoteStatus, visibleNoteMarker } from "./ui-rich-render-notes.ts";
import {
  hasPreview,
  type InteractiveRow,
  interactiveRows,
  selectedIndexesForQuestion,
} from "./ui-rich-state.ts";

export function renderOverlay(env: RenderEnv): string[] {
  const lines: string[] = [];
  const add = (text: string) => lines.push(truncateToWidth(text, env.width));
  add(env.theme.fg("accent", "─".repeat(env.width)));
  if (env.flow.isMultiQuestion) renderTabBar(lines, env);
  if (env.flow.currentMode === "reviewing") {
    lines.push(...renderReview(env));
  } else {
    renderQuestion(lines, env);
  }
  add(env.theme.fg("dim", ` ${footerHelp(env.flow, env.state)}`));
  add(env.theme.fg("accent", "─".repeat(env.width)));
  return lines;
}

function tabSegment(
  env: RenderEnv,
  text: string,
  active: boolean,
  color: "success" | "muted" | "dim" | "text",
): string {
  return active
    ? env.theme.bg("selectedBg", env.theme.fg("text", text))
    : env.theme.fg(color, text);
}

function renderTabBar(lines: string[], env: RenderEnv): void {
  const segments: string[] = [env.theme.fg("dim", "← ")];
  for (const [index, question] of env.flow.questions.entries()) {
    const answered = env.flow.hasAnswer(question.id);
    const active = env.flow.currentMode === "answering" && env.flow.currentIndex === index;
    const marker = answered ? "■" : question.required ? "□" : "○";
    const color = answered ? "success" : question.required ? "muted" : "dim";
    segments.push(tabSegment(env, ` ${marker} ${question.header} `, active, color));
    segments.push(" ");
  }
  const reviewActive = env.flow.currentMode === "reviewing";
  segments.push(tabSegment(env, " ✓ Review ", reviewActive, reviewActive ? "text" : "dim"));
  segments.push(env.theme.fg("dim", " →"));
  lines.push(truncateToWidth(` ${segments.join("")}`, env.width));
  lines.push("");
}

function renderQuestion(lines: string[], env: RenderEnv): void {
  const question = env.flow.currentQuestion;
  if (!question) return;
  for (const line of wrapTextWithAnsi(` ${question.prompt}`, env.width)) {
    lines.push(truncateToWidth(env.theme.fg("text", line), env.width));
  }
  lines.push("");
  if (question.type === "text") {
    renderTextQuestion(lines, env);
    return;
  }
  renderStructuredQuestion(lines, env, question);
}

function renderSplitView(
  lines: string[],
  env: RenderEnv,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): void {
  const leftWidth = Math.max(34, Math.floor(env.width * 0.42));
  const rightWidth = Math.max(24, env.width - leftWidth - 3);
  const leftLines = renderPaneRows(env, question, rows);
  const rightLines = usesSeparateEditorPane(env.state)
    ? renderEditorPane(rightWidth, env.theme, env.editor, editorCaption(env.state))
    : renderPreviewPane(
        rightWidth,
        env.theme,
        previewForSelection(question, rows[env.state.selectedIndex]),
      );
  const total = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < total; index += 1) {
    const left = padRight(leftLines[index] ?? "", leftWidth);
    const right = padRight(rightLines[index] ?? "", rightWidth);
    lines.push(`${left} ${env.theme.fg("accent", "│")} ${right}`);
  }
}

function renderTextQuestion(lines: string[], env: RenderEnv): void {
  lines.push(...renderEditorBlock(env, "Answer"));
}

function renderStructuredQuestion(
  lines: string[],
  env: RenderEnv,
  question: NormalizedStructuredQuestion,
): void {
  const rows = interactiveRows(question);
  if (hasPreview(question) && env.width >= 100) {
    renderSplitView(lines, env, question, rows);
  } else {
    renderStandardStructuredQuestion(lines, env, question, rows);
  }
  const note = currentNote(env.flow, env.state, question);
  if (note) lines.push(...renderNoteStatus(env.theme, note));
}

function renderStandardStructuredQuestion(
  lines: string[],
  env: RenderEnv,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): void {
  lines.push(...renderRows(env, question, rows));
  if (usesSeparateEditorPane(env.state)) {
    lines.push(...renderEditorBlock(env, editorCaption(env.state)));
    return;
  }
  const preview = previewForSelection(question, rows[env.state.selectedIndex]);
  if (preview) lines.push(...renderPreviewBlock(env, preview));
}

function renderPaneRows(
  env: RenderEnv,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): string[] {
  return renderRows(env, question, rows);
}

function renderRows(
  env: RenderEnv,
  question: NormalizedStructuredQuestion,
  rows: InteractiveRow[],
): string[] {
  const out: string[] = [];
  for (const [index, row] of rows.entries()) {
    const active = env.state.selectedIndex === index;
    const prefix = active ? env.theme.fg("accent", "> ") : "  ";
    const inlineEditorLines = inlineStructuredRowLines({
      width: env.width,
      theme: env.theme,
      state: env.state,
      editor: env.editor,
      row,
      prefix,
    });
    if (inlineEditorLines) {
      const rowContinuation = " ".repeat(visibleWidth(prefix));
      for (const [lineIndex, line] of inlineEditorLines.entries()) {
        out.push(
          truncateToWidth(`${lineIndex === 0 ? prefix : rowContinuation}${line}`, env.width),
        );
      }
      continue;
    }
    addWrapped(out, env, prefix, rowLabel(env, question, row, active));
    const description = rowDescription(question, row);
    if (description) addWrapped(out, env, "     ", env.theme.fg("muted", description));
  }
  return out;
}

function rowLabel(
  env: RenderEnv,
  question: NormalizedStructuredQuestion,
  row: InteractiveRow,
  active: boolean,
): string {
  const selected = selectedIndexesForQuestion(env.flow, env.state, question);
  if (row.kind === "option") {
    const option = question.options[row.optionIndex];
    const recommended = question.recommendedIndexes.includes(row.optionIndex);
    const noteMarker = visibleNoteMarker({
      flow: env.flow,
      state: env.state,
      question,
      row,
      active,
    });
    const baseLabel = `${decorateOption(option.label, recommended)}${noteMarker ? ` ${NOTE_MARKER}` : ""}`;
    if (question.type === "multichoice") {
      const checked = selected.includes(row.optionIndex) ? "[x]" : "[ ]";
      return env.theme.fg("text", `${checked} ${baseLabel}`);
    }
    return env.theme.fg("text", `${row.optionIndex + 1}. ${baseLabel}`);
  }
  if (row.kind === "other")
    return env.theme.fg("text", structuredRowLabel(env.flow, question, row));
  return env.theme.fg("text", structuredRowLabel(env.flow, question, row));
}

function rowDescription(
  question: NormalizedStructuredQuestion,
  row: InteractiveRow,
): string | undefined {
  if (row.kind === "option") return question.options[row.optionIndex].description;
  return undefined;
}

function renderPreviewPane(
  width: number,
  theme: RenderEnv["theme"],
  preview: string | undefined,
): string[] {
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

function renderPreviewBlock(env: RenderEnv, preview: string): string[] {
  const out: string[] = [];
  out.push("");
  out.push(env.theme.fg("accent", " Preview:"));
  for (const line of preview.split("\n")) {
    out.push(truncateToWidth(` ${line}`, env.width));
  }
  return out;
}

function previewForSelection(
  question: NormalizedStructuredQuestion,
  row: InteractiveRow | undefined,
): string | undefined {
  return row?.kind === "option" ? question.options[row.optionIndex].preview : undefined;
}

function renderReview(env: RenderEnv): string[] {
  const out: string[] = [];
  const add = (text: string) => out.push(truncateToWidth(text, env.width));
  add(env.theme.fg("accent", " Review answers:"));
  add("");
  for (const question of env.flow.questions) {
    const answer = env.flow.getAnswer(question.id);
    const answerLines = answer
      ? formatReviewLines(question, answer)
      : [question.required ? "(no answer)" : "(skipped)"];
    add(env.theme.fg("muted", ` ${question.header}:`));
    for (const line of answerLines) addWrapped(out, env, "   ", env.theme.fg("text", line));
  }
  add("");
  if (env.flow.showSkip) {
    add(
      env.theme.fg(
        env.flow.allRequiredAnswered() ? "success" : "warning",
        " Press Enter to submit • s to skip",
      ),
    );
  } else {
    add(
      env.theme.fg(
        env.flow.allRequiredAnswered() ? "success" : "warning",
        " Press Enter to submit",
      ),
    );
  }
  return out;
}

function addWrapped(lines: string[], env: RenderEnv, prefix: string, text: string): void {
  const prefixWidth = visibleWidth(prefix);
  const contentWidth = Math.max(1, env.width - prefixWidth);
  const continuationPrefix = " ".repeat(prefixWidth);
  for (const [index, line] of wrapTextWithAnsi(text, contentWidth).entries()) {
    lines.push(truncateToWidth(`${index === 0 ? prefix : continuationPrefix}${line}`, env.width));
  }
}
