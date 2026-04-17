// Pure rendering helpers for the rich overlay. Kept separate from
// ui-rich.ts to stay within Biome's per-file line limit and so the input
// dispatch logic can be read without scrolling past a wall of theme strings.

import type { Theme } from "@mariozechner/pi-coding-agent";
import { type Editor, truncateToWidth } from "@mariozechner/pi-tui";
import type { QuestionnaireFlow } from "./flow.ts";
import { decorateOption, formatReviewLine, OTHER_LABEL } from "./format.ts";
import type { NormalizedQuestion } from "./types.ts";

export type SubMode = "select" | "other-input" | "text-input" | "comment-prompt" | "comment-input";

export interface OverlayRenderState {
  optionIndex: number;
  subMode: SubMode;
}

export function isEditorMode(mode: SubMode): boolean {
  return mode === "text-input" || mode === "other-input" || mode === "comment-input";
}

export function displayOptionCount(q: NormalizedQuestion): number {
  return q.options.length + (q.allowOther ? 1 : 0);
}

// biome-ignore lint/complexity/useMaxParams: render entry needs full overlay context
export function renderOverlay(
  width: number,
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
): string[] {
  const lines: string[] = [];
  const add = (s: string) => lines.push(truncateToWidth(s, width));
  add(theme.fg("accent", "─".repeat(width)));
  if (flow.isMultiQuestion) renderTabBar(add, theme, flow);
  if (flow.currentMode === "reviewing") {
    renderReview(add, theme, flow);
  } else {
    renderQuestionBody(add, lines, theme, flow, state, editor, width);
  }
  add(theme.fg("dim", ` ${footerHelp(flow, state)}`));
  add(theme.fg("accent", "─".repeat(width)));
  return lines;
}

function renderTabBar(add: (s: string) => void, theme: Theme, flow: QuestionnaireFlow): void {
  // Active segment uses the selected-bg highlight (matches pi's reference
  // questionnaire and Claude's UI). Inactive segments stay foreground-only:
  // success when answered, muted when pending.
  const segments: string[] = [theme.fg("dim", "← ")];
  flow.questions.forEach((q, i) => {
    const answered = flow.hasAnswer(q.id);
    const active =
      !flow.isTerminal() && flow.currentMode === "answering" && flow.currentIndex === i;
    const marker = answered ? "■" : "□";
    const text = ` ${marker} ${q.header} `;
    segments.push(
      active
        ? theme.bg("selectedBg", theme.fg("text", text))
        : theme.fg(answered ? "success" : "muted", text),
    );
    segments.push(" ");
  });
  const reviewActive = flow.currentMode === "reviewing";
  const reviewText = " ✓ Review ";
  segments.push(
    reviewActive
      ? theme.bg("selectedBg", theme.fg("text", reviewText))
      : theme.fg("dim", reviewText),
  );
  segments.push(theme.fg("dim", " →"));
  add(` ${segments.join("")}`);
  add("");
}

// biome-ignore lint/complexity/useMaxParams: dispatcher needs full overlay context
function renderQuestionBody(
  add: (s: string) => void,
  lines: string[],
  theme: Theme,
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  editor: Editor,
  width: number,
): void {
  const q = flow.currentQuestion;
  if (!q) return;
  add(theme.fg("text", ` ${q.prompt}`));
  lines.push("");
  if (q.type !== "text") renderOptions(add, theme, q, state.optionIndex);
  if (q.type !== "text" && state.subMode === "select") {
    add("");
    add(theme.fg("dim", " n to add notes"));
  }
  if (state.subMode === "text-input" || state.subMode === "other-input") {
    const caption = state.subMode === "other-input" ? "Other" : "Answer";
    renderEditorBlock(add, lines, theme, editor, width, caption);
  }
  if (state.subMode === "comment-prompt") {
    add("");
    add(theme.fg("muted", " Add a note? (y/n)"));
  }
  if (state.subMode === "comment-input") {
    renderEditorBlock(add, lines, theme, editor, width, "Note");
  }
}

function renderOptions(
  add: (s: string) => void,
  theme: Theme,
  q: NormalizedQuestion,
  optionIndex: number,
): void {
  const items = buildOptionItems(q);
  items.forEach((item, i) => {
    const selected = i === optionIndex;
    const prefix = selected ? theme.fg("accent", "> ") : "  ";
    const numbered = `${i + 1}. ${item.label}`;
    add(prefix + (selected ? theme.fg("accent", numbered) : theme.fg("text", numbered)));
    if (item.description) {
      add(`     ${theme.fg("muted", item.description)}`);
    }
  });
}

interface OptionItem {
  label: string;
  description?: string;
}

function buildOptionItems(q: NormalizedQuestion): OptionItem[] {
  const items: OptionItem[] = q.options.map((opt, i) => ({
    label: decorateOption(opt.label, i === q.recommendedIndex),
    description: opt.description,
  }));
  if (q.allowOther) items.push({ label: OTHER_LABEL });
  return items;
}

// biome-ignore lint/complexity/useMaxParams: render dispatcher
function renderEditorBlock(
  add: (s: string) => void,
  lines: string[],
  theme: Theme,
  editor: Editor,
  width: number,
  caption: string,
): void {
  add("");
  add(theme.fg("muted", ` ${caption}:`));
  for (const line of editor.render(width - 2)) lines.push(` ${line}`);
}

function renderReview(add: (s: string) => void, theme: Theme, flow: QuestionnaireFlow): void {
  add(theme.fg("accent", " Review answers:"));
  add("");
  for (const q of flow.questions) {
    add(
      `${theme.fg("muted", ` ${q.header}: `)}${theme.fg("text", formatReviewLine(q, flow.getAnswer(q.id)))}`,
    );
  }
  add("");
  add(theme.fg(flow.allAnswered() ? "success" : "warning", " Press Enter to submit"));
}

function footerHelp(flow: QuestionnaireFlow, state: OverlayRenderState): string {
  // Text questions have no select/back state to fall into, so Esc cancels the
  // whole questionnaire (see ui-rich.handleEditorEscape). The hint must say so.
  if (state.subMode === "text-input") return "Enter to submit • Esc to cancel";
  if (isEditorMode(state.subMode)) return "Enter to submit • Esc to go back";
  if (state.subMode === "comment-prompt")
    return "y to add a note • n/Enter to skip • Esc to cancel";
  if (flow.currentMode === "reviewing")
    return "Enter to submit • ←/Shift-Tab to revise • Esc to cancel";
  if (flow.isMultiQuestion)
    return "↑↓ select • Enter confirm • n add note • ←/Shift-Tab back • →/Tab review • Esc cancel";
  return "↑↓ select • Enter confirm • n add note • Esc cancel";
}
