import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { AskUserResponse, NormalizedQuestion } from "../types.ts";
import type { RenderFormFrameArgs } from "./form-render.ts";
import {
  pushWrappedWithPrefix,
  renderMiniBox,
  safeWidth,
  wrapLines,
} from "./form-render-primitives.ts";
import type { FormLineRange, RenderedFormSection } from "./form-viewport.ts";

export function renderReviewScreen(args: RenderFormFrameArgs): RenderedFormSection {
  const lines: string[] = [];
  const outcome = args.controller.outcome();
  const questionCount = args.controller.questionnaire.questions.length;
  const submitIndex = questionCount;
  let focusedRange: FormLineRange | undefined;

  lines.push(args.theme.fg("accent", "Review your answers"));
  lines.push(
    args.theme.fg("dim", "Check answers, comments, and unanswered items before submitting."),
  );
  lines.push("");

  for (let i = 0; i < outcome.responses.length; i += 1) {
    const resp = outcome.responses[i];
    const question = args.controller.questionnaire.questions[i];
    const focused = i === args.reviewFocusIndex;
    const start = lines.length;
    lines.push(...renderReviewQuestionCard(args, question, resp, focused));
    if (focused) focusedRange = { start, end: lines.length };
  }

  if (outcome.comment) {
    lines.push("");
    lines.push(...renderMiniBox(args.theme, "Form comment", [outcome.comment], args.width));
  }

  lines.push("");
  const submitFocused = args.reviewFocusIndex === submitIndex;
  const submitStart = lines.length;
  lines.push(...renderSubmitCard(args, submitFocused));
  if (submitFocused) focusedRange = { start: submitStart, end: lines.length };

  return { lines, focusedRange };
}

function renderReviewQuestionCard(
  args: RenderFormFrameArgs,
  question: NormalizedQuestion,
  response: AskUserResponse,
  focused: boolean,
): string[] {
  const width = safeWidth(args.width);
  const prefix = focused ? args.theme.fg("accent", " → ") : "   ";
  const headerPrefix = focused
    ? args.theme.fg("accent", "╭─ → ")
    : args.theme.fg("borderMuted", "╭─   ");
  const bottom = focused
    ? args.theme.fg("accent", `╰${"─".repeat(Math.max(1, width - 2))}╯`)
    : args.theme.fg("borderMuted", `╰${"─".repeat(Math.max(1, width - 2))}╯`);
  const status = response.answer.answered
    ? args.theme.fg("success", "[✓]")
    : args.theme.fg("warning", "[?]");
  const lines: string[] = [];

  pushWrappedWithPrefix({
    lines,
    prefix: headerPrefix,
    text: `${status} ${question.header}`,
    width,
  });

  const bodyLines = renderReviewResponseLines(args.theme, response, width - 3);
  for (const line of bodyLines) {
    lines.push(`${prefix}${truncateToWidth(line, width - 3)}`);
  }

  if (response.questionComment) {
    pushWrappedWithPrefix({
      lines,
      prefix,
      text: args.theme.fg("dim", `Question comment: ${response.questionComment}`),
      width,
    });
  }

  lines.push(bottom);
  return lines.map((line) => truncateToWidth(line, width));
}

function renderSubmitCard(args: RenderFormFrameArgs, focused: boolean): string[] {
  const width = safeWidth(args.width);
  const prefix = focused ? args.theme.fg("accent", " → ") : "   ";
  const headerPrefix = focused
    ? args.theme.fg("accent", "╭─ → ")
    : args.theme.fg("borderMuted", "╭─   ");
  const bottom = focused
    ? args.theme.fg("accent", `╰${"─".repeat(Math.max(1, width - 2))}╯`)
    : args.theme.fg("borderMuted", `╰${"─".repeat(Math.max(1, width - 2))}╯`);
  const lines: string[] = [];

  pushWrappedWithPrefix({
    lines,
    prefix: headerPrefix,
    text: focused ? args.theme.fg("accent", "Submit form") : "Submit form",
    width,
  });
  pushWrappedWithPrefix({
    lines,
    prefix,
    text: args.theme.fg("dim", "Enter submits · c edits form comment"),
    width,
  });
  lines.push(bottom);
  return lines.map((line) => truncateToWidth(line, width));
}

function renderReviewResponseLines(
  theme: Theme,
  response: AskUserResponse,
  width: number,
): string[] {
  const lines: string[] = [];

  if (response.answer.kind === "text") {
    lines.push(
      response.answer.answered
        ? `Answer: ${response.answer.value ?? ""}`
        : theme.fg("warning", "Answer: unanswered"),
    );
    return wrapLines(lines, safeWidth(width));
  }

  if (response.answer.options.length === 0) {
    lines.push(theme.fg("warning", "Answer: unanswered"));
    return wrapLines(lines, safeWidth(width));
  }

  if (!response.answer.answered) {
    lines.push(theme.fg("warning", "Answer: unanswered"));
  }

  for (const option of response.answer.options) {
    const marker = option.selected ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
    const comment = option.comment ? theme.fg("dim", ` — ${option.comment}`) : "";
    lines.push(`${marker} ${option.label}${comment}`);
  }

  return wrapLines(lines, safeWidth(width));
}
