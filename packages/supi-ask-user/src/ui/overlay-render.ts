import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  type Editor,
  type EditorTheme,
  Markdown,
  type SelectList,
  type SelectListTheme,
} from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import type { NormalizedQuestionnaire } from "../types.ts";
import {
  type ChoiceRow,
  type FocusTarget,
  footerText,
  type OverlayMode,
  renderChoiceList,
  splitColumns,
} from "./overlay-view.ts";

export interface RenderOverlayFrameArgs {
  width: number;
  theme: Theme;
  controller: AskUserController;
  mode: OverlayMode;
  focus: FocusTarget;
  editor: Editor;
  choiceRows: ChoiceRow[];
  choiceRowIndex: number;
  actionList: SelectList | undefined;
  textActionLabels: string[];
  previewText?: string;
  noteTargetLabel?: string;
}

export function renderOverlayFrame(args: RenderOverlayFrameArgs): string[] {
  const lines: string[] = [];
  lines.push(args.theme.fg("accent", "─".repeat(args.width)));
  lines.push(...renderHeader(args));
  lines.push(...renderPrompt(args.controller.currentQuestion.prompt, args.width));
  lines.push("");
  lines.push(...renderBody(args));
  lines.push("");
  lines.push(
    args.theme.fg(
      "dim",
      footerText({
        controller: args.controller,
        mode: args.mode,
        focus: args.focus,
        hasTextActions: args.textActionLabels.length > 0,
      }),
    ),
  );
  lines.push(args.theme.fg("accent", "─".repeat(args.width)));
  return lines;
}

export function makeEditorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (text) => theme.fg("accent", text),
    selectList: makeSelectListTheme(theme),
  };
}

export function makeSelectListTheme(theme: Theme): SelectListTheme {
  return {
    selectedPrefix: (text) => theme.fg("accent", text),
    selectedText: (text) => theme.fg("accent", text),
    description: (text) => theme.fg("muted", text),
    scrollInfo: (text) => theme.fg("dim", text),
    noMatch: (text) => theme.fg("warning", text),
  };
}

export function currentPreviewText(
  question: NormalizedQuestionnaire["questions"][number],
  optionIndex: number,
): string | undefined {
  return question.type === "choice" ? question.options[optionIndex]?.preview : undefined;
}

export function currentTextValue(
  controller: AskUserController,
  initial: string | undefined,
): string {
  const answer = controller.getAnswer(controller.currentQuestion.id);
  return answer?.kind === "text" ? answer.value : (initial ?? "");
}

export function currentCustomValue(controller: AskUserController): string {
  const answer = controller.getAnswer(controller.currentQuestion.id);
  return answer?.kind === "custom" ? answer.value : "";
}

export function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function renderHeader(args: RenderOverlayFrameArgs): string[] {
  const lines: string[] = [];
  const { title, intro } = args.controller.questionnaire;
  if (title) lines.push(args.theme.fg("accent", args.theme.bold(title)));
  lines.push(
    args.theme.fg(
      "muted",
      `${args.controller.currentIndex + 1}/${args.controller.questions.length} · ${args.controller.currentQuestion.header}`,
    ),
  );
  if (intro) {
    lines.push("");
    lines.push(...renderPrompt(intro, args.width));
  }
  return lines;
}

function renderBody(args: RenderOverlayFrameArgs): string[] {
  const question = args.controller.currentQuestion;
  if (question.type === "text") {
    return renderTextBody(args);
  }
  return renderChoiceBody(args);
}

function renderChoiceBody(args: RenderOverlayFrameArgs): string[] {
  const question = args.controller.currentQuestion;
  const listWidth = splitLeftWidth(args.width);

  const leftLines =
    question.type === "choice"
      ? renderChoiceList({
          controller: args.controller,
          question,
          rows: args.choiceRows,
          selectedIndex: args.choiceRowIndex,
          theme: args.theme,
          width: listWidth,
        })
      : [];

  if (args.mode === "custom-input" || args.mode === "discuss-input" || args.mode === "note-input") {
    const rightLines = renderEditorLines(args, splitRightWidth(args.width));
    if (args.width >= 100) {
      return splitColumns({
        width: args.width,
        theme: args.theme,
        leftLines,
        rightLines,
      });
    }
    return [...leftLines, "", ...rightLines];
  }

  if (args.previewText && args.width >= 100) {
    const rightLines = [
      args.theme.fg("accent", "Preview"),
      "",
      ...renderPrompt(args.previewText, splitRightWidth(args.width)),
    ];
    return splitColumns({
      width: args.width,
      theme: args.theme,
      leftLines,
      rightLines,
    });
  }

  if (!args.previewText) return leftLines;
  return [
    ...leftLines,
    "",
    args.theme.fg("accent", "Preview"),
    ...renderPrompt(args.previewText, args.width),
  ];
}

function renderTextBody(args: RenderOverlayFrameArgs): string[] {
  const lines = renderEditorLines(args, args.width);
  if (args.textActionLabels.length === 0) return lines;

  if (args.focus === "actions") {
    return [...lines, "", ...(args.actionList?.render(args.width) ?? [])];
  }

  return [...lines, "", ...args.textActionLabels.map((label) => `  ${label}`)];
}

function renderEditorLines(args: RenderOverlayFrameArgs, width: number): string[] {
  const label =
    args.mode === "discuss-input"
      ? "Discuss instead"
      : args.mode === "custom-input"
        ? "Other answer"
        : args.mode === "note-input"
          ? args.noteTargetLabel
            ? `Note for: ${args.noteTargetLabel}`
            : "Option note"
          : "Your answer";

  const lines = [args.theme.fg("accent", label), ...args.editor.render(Math.max(20, width - 1))];
  const question = args.controller.currentQuestion;
  if (question.type !== "text" || args.editor.getText()) return lines;

  if (question.initial) {
    lines.push(args.theme.fg("dim", `Initial: ${question.initial}`));
  } else if (question.placeholder) {
    lines.push(args.theme.fg("dim", `Placeholder: ${question.placeholder}`));
  }
  return lines;
}

function renderPrompt(text: string, width: number): string[] {
  return new Markdown(text, 0, 0, getMarkdownTheme()).render(Math.max(1, width));
}

function splitLeftWidth(width: number): number {
  return Math.max(36, Math.floor(width * 0.55));
}

function splitRightWidth(width: number): number {
  return Math.max(24, width - splitLeftWidth(width) - 3);
}
