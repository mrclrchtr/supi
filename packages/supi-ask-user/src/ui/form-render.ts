import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Editor, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import type { NormalizedChoiceQuestion } from "../types.ts";
import {
  formatSplitLine,
  padRight,
  pushWrappedWithPrefix,
  renderMiniBox,
  renderPrompt,
  safeWidth,
} from "./form-render-primitives.ts";
import { renderReviewScreen } from "./form-review-render.ts";
import type { FocusTarget, FormMode } from "./form-view.ts";

export interface RenderFormFrameArgs {
  width: number;
  theme: Theme;
  controller: AskUserController;
  mode: FormMode;
  focus: FocusTarget;
  editor: Editor;
  choiceFocusIndex: number;
  reviewFocusIndex: number;
  previewText?: string;
  editorLabel?: string;
  editorContext?: string;
}

export function renderFormFrame(args: RenderFormFrameArgs): string[] {
  const width = safeWidth(args.width);
  if (width < 8) {
    return renderFrameContent({ ...args, width }).map((line) => truncateToWidth(line, width));
  }

  const innerWidth = Math.max(1, width - 4);
  const content = renderFrameContent({ ...args, width: innerWidth });
  const border = args.theme.fg("borderAccent", "│");
  const top = args.theme.fg("borderAccent", `╭${"─".repeat(width - 2)}╮`);
  const bottom = args.theme.fg("borderAccent", `╰${"─".repeat(width - 2)}╯`);

  return [
    top,
    ...content.map((line) => `${border} ${padRight(line, innerWidth)} ${border}`),
    bottom,
  ].map((line) => truncateToWidth(line, width));
}

function renderFrameContent(args: RenderFormFrameArgs): string[] {
  const width = safeWidth(args.width);
  const lines: string[] = [];
  lines.push(...renderHeader(args));
  lines.push("");

  if (args.mode === "review") {
    lines.push(...renderReviewScreen(args));
  } else if (isEditorMode(args.mode)) {
    lines.push(...renderEditorScreen(args));
  } else {
    const question = args.controller.currentQuestion;
    if (question.type === "text") {
      lines.push(...renderTextScreen(args));
    } else {
      lines.push(...renderChoiceScreen(args));
    }
  }

  lines.push("");
  lines.push(...wrapTextWithAnsi(args.theme.fg("dim", renderFooter(args)), width));
  return lines.map((line) => truncateToWidth(line, width));
}

function renderHeader(args: RenderFormFrameArgs): string[] {
  const lines: string[] = [];
  const { intro, title } = args.controller.questionnaire;
  const titleText = args.theme.fg("accent", args.theme.bold(title ?? "ask_user"));
  const contextText = args.theme.fg("muted", headerContext(args));

  lines.push(formatSplitLine(titleText, contextText, args.width));
  lines.push(renderProgressLine(args));

  if (intro) {
    lines.push("");
    lines.push(...renderPrompt(intro, args.width));
    lines.push("");
    lines.push(args.theme.fg("borderMuted", "─".repeat(args.width)));
  }

  return lines;
}

function headerContext(args: RenderFormFrameArgs): string {
  if (args.mode === "review") return "Review · all questions";
  if (args.mode === "form-comment") return "Review · form comment";

  const q = args.controller.currentQuestion;
  return `Question ${args.controller.currentIndex + 1}/${args.controller.questionnaire.questions.length} · ${q.header}`;
}

function renderProgressLine(args: RenderFormFrameArgs): string {
  const questionCount = args.controller.questionnaire.questions.length;
  const totalSteps = questionCount + 1;
  const currentStep =
    args.mode === "review" || args.mode === "form-comment"
      ? totalSteps
      : args.controller.currentIndex + 1;
  const segments = Array.from({ length: totalSteps }, (_entry, index) => {
    if (index < currentStep - 1) return args.theme.fg("success", "●");
    if (index === currentStep - 1) return args.theme.fg("accent", "●");
    return args.theme.fg("dim", "○");
  }).join(" ");
  const label =
    args.mode === "review" || args.mode === "form-comment"
      ? "Step review"
      : `Step ${currentStep}/${totalSteps}`;

  return truncateToWidth(`${args.theme.fg("dim", label)}  ${segments}`, args.width);
}

function renderChoiceScreen(args: RenderFormFrameArgs): string[] {
  const lines: string[] = [];
  const question = args.controller.currentQuestion;

  if (question.type !== "choice") return lines;

  lines.push(...renderPrompt(question.prompt, args.width));
  if (args.controller.isQuestionMarkedUnanswered(question.id)) {
    lines.push("");
    lines.push(args.theme.fg("warning", "Marked unanswered; comments preserved."));
  }
  lines.push("");

  if (args.previewText && args.width >= 80) {
    lines.push(...renderChoiceWithPreview(args, question));
    return lines;
  }

  for (let i = 0; i < question.options.length; i += 1) {
    lines.push(...renderChoiceOptionLines(args, question, i, args.width));
  }

  if (args.previewText) {
    lines.push("");
    lines.push(...renderPreviewCard(args.theme, args.previewText, args.width));
  }

  return lines;
}

function renderChoiceWithPreview(
  args: RenderFormFrameArgs,
  question: NormalizedChoiceQuestion,
): string[] {
  const gap = 2;
  const divider = args.theme.fg("borderMuted", "│");
  const dividerWidth = 1;
  const minLeftWidth = 28;
  const preferredPreviewWidth = Math.max(30, Math.floor(args.width * 0.38));
  const rightWidth = Math.max(
    22,
    Math.min(preferredPreviewWidth, args.width - gap - dividerWidth - gap - minLeftWidth),
  );
  const leftWidth = Math.max(1, args.width - gap - dividerWidth - gap - rightWidth);

  const optionLines: string[] = [];
  for (let i = 0; i < question.options.length; i += 1) {
    optionLines.push(...renderChoiceOptionLines(args, question, i, leftWidth));
  }

  const previewLines = renderPreviewCard(args.theme, args.previewText ?? "", rightWidth);

  const merged: string[] = [];
  const maxRows = Math.max(optionLines.length, previewLines.length);
  for (let i = 0; i < maxRows; i += 1) {
    const left = optionLines[i] ?? "";
    const right = previewLines[i] ?? "";
    const mergedLine = `${padRight(left, leftWidth)}${" ".repeat(gap)}${divider}${" ".repeat(gap)}${right}`;
    merged.push(truncateToWidth(mergedLine, args.width));
  }

  return merged;
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

function renderTextScreen(args: RenderFormFrameArgs): string[] {
  const lines: string[] = [];
  const question = args.controller.currentQuestion;

  if (question.type !== "text") return lines;

  lines.push(...renderPrompt(question.prompt, args.width));
  lines.push("");
  lines.push(args.theme.fg("accent", "Your answer"));
  lines.push(...args.editor.render(safeWidth(args.width)));

  if (question.placeholder && !args.editor.getText()) {
    lines.push("");
    lines.push(
      ...wrapTextWithAnsi(args.theme.fg("dim", `Placeholder: ${question.placeholder}`), args.width),
    );
  }

  return lines;
}

function renderEditorScreen(args: RenderFormFrameArgs): string[] {
  const lines: string[] = [];
  const label = args.editorLabel ?? "Editor";
  const title = args.editorContext ? `${label}: ${args.editorContext}` : label;
  lines.push(args.theme.fg("accent", title));
  lines.push(...args.editor.render(safeWidth(args.width)));
  return lines;
}

function renderPreviewCard(theme: Theme, previewText: string, width: number): string[] {
  const innerWidth = Math.max(1, safeWidth(width) - 4);
  return renderMiniBox(theme, "Preview", renderPrompt(previewText, innerWidth), width);
}

function renderFooter(args: RenderFormFrameArgs): string {
  if (args.mode === "review") {
    return "Keys: ↑↓ move · Enter edit/submit · c form comment · ←/Shift+Tab back · Esc cancel";
  }

  if (isEditorMode(args.mode)) {
    return "Keys: Enter save · Esc discard";
  }

  const question = args.controller.currentQuestion;

  if (question.type === "text") {
    return "Keys: Enter submit · Alt+C question comment · Alt+U unanswered · Tab next · Shift+Tab back · Esc cancel";
  }

  if (question.multi) {
    return "Keys: ↑↓ move · Space toggle · Enter accept · c question comment · n option comment · u unanswered · ←/→ or Tab/Shift+Tab · Esc cancel";
  }

  return "Keys: ↑↓ move · Space select · Enter select · c question comment · n option comment · u unanswered · ←/→ or Tab/Shift+Tab · Esc cancel";
}

function isEditorMode(mode: FormMode): boolean {
  return mode === "question-comment" || mode === "form-comment" || mode === "option-comment";
}
