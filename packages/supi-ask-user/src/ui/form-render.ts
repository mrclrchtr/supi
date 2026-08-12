import type { Theme } from "@earendil-works/pi-coding-agent";
import { type EditorComponent, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AskUserController } from "../session/controller.ts";
import {
  renderChoiceScreen,
  renderEditorScreen,
  renderTextScreen,
} from "./form-question-render.ts";
import { formatSplitLine, padRight, renderPrompt, safeWidth } from "./form-render-primitives.ts";
import { renderReviewScreen } from "./form-review-render.ts";
import type { FocusTarget, FormMode } from "./form-view.ts";
import {
  type FormLineRange,
  type FormViewportLayout,
  layoutFormViewport,
  offsetFormLineRange,
  type RenderedFormSection,
} from "./form-viewport.ts";

const MIN_FRAMED_WIDTH = 8;
const FRAME_HORIZONTAL_CHROME = 4;
const FRAME_BORDER_ROWS = 2;
const SCROLL_INDICATOR_ROWS = 1;
const PLAIN_SCROLL_INDICATOR_MIN_HEIGHT = 2;
const COMPACT_SCROLL_INDICATOR_WIDTH = 8;

/** Inputs required to render one form frame and its current viewport state. */
export interface RenderFormFrameArgs {
  width: number;
  maxHeight: number;
  scrollOffset: number;
  revealFocus: boolean;
  theme: Theme;
  controller: AskUserController;
  mode: FormMode;
  focus: FocusTarget;
  editor: EditorComponent;
  choiceFocusIndex: number;
  reviewFocusIndex: number;
  detailsText?: string;
  editorLabel?: string;
  editorContext?: string;
}

/** Rendered terminal lines plus the viewport state retained by the form component. */
export interface RenderedFormFrame {
  lines: string[];
  viewport: FormViewportLayout & { overflow: boolean };
}

/**
 * Render the complete form when it fits. For overflow, keep the header fixed and
 * allocate the remaining framed rows to a scrollable content window and indicator.
 */
export function renderFormFrame(args: RenderFormFrameArgs): RenderedFormFrame {
  const width = safeWidth(args.width);
  const maxHeight = Math.max(1, Math.floor(args.maxHeight));
  const frameArgs = {
    ...args,
    width: width < MIN_FRAMED_WIDTH ? width : Math.max(1, width - FRAME_HORIZONTAL_CHROME),
  };
  const header = renderHeader(frameArgs);
  const body = renderFrameBody(frameArgs);
  const footer = [
    "",
    ...wrapTextWithAnsi(frameArgs.theme.fg("dim", renderFooter(frameArgs)), frameArgs.width),
  ];
  const scrollableContent = [...body.lines, ...footer];
  const fullContent = [...header, ...scrollableContent];
  const fullFocusedRange = offsetFormLineRange(body.focusedRange, header.length);
  const naturalHeight = fullContent.length + (width < MIN_FRAMED_WIDTH ? 0 : FRAME_BORDER_ROWS);

  if (naturalHeight <= maxHeight) {
    return {
      lines:
        width < MIN_FRAMED_WIDTH
          ? truncateLines(fullContent, width)
          : frameLines(args.theme, fullContent, width),
      viewport: completeViewport(body.lines),
    };
  }

  if (width < MIN_FRAMED_WIDTH) {
    const showIndicator = maxHeight >= PLAIN_SCROLL_INDICATOR_MIN_HEIGHT;
    const viewport = layoutFormViewport({
      lines: fullContent,
      maxRows: maxHeight - (showIndicator ? 1 : 0),
      scrollOffset: args.scrollOffset,
      focusedRange: fullFocusedRange,
      revealFocus: args.revealFocus,
    });
    const lines = showIndicator
      ? [...viewport.lines, renderScrollIndicator(args.theme, viewport, width, scrollHint(args))]
      : viewport.lines;
    return {
      lines: truncateLines(lines, width),
      viewport: { ...viewport, overflow: true },
    };
  }

  return renderConstrainedFrame({
    args: frameArgs,
    width,
    maxHeight,
    header,
    scrollableContent,
    focusedRange: body.focusedRange,
    fullContent,
    fullFocusedRange,
  });
}

function renderConstrainedFrame(options: {
  args: RenderFormFrameArgs;
  width: number;
  maxHeight: number;
  header: string[];
  scrollableContent: string[];
  focusedRange?: FormLineRange;
  fullContent: string[];
  fullFocusedRange?: FormLineRange;
}): RenderedFormFrame {
  const { args, width, maxHeight, header, scrollableContent, focusedRange } = options;
  const contentRows = maxHeight - header.length - FRAME_BORDER_ROWS - SCROLL_INDICATOR_ROWS;
  if (contentRows >= 1) {
    const viewport = layoutFormViewport({
      lines: scrollableContent,
      maxRows: contentRows,
      scrollOffset: args.scrollOffset,
      focusedRange,
      revealFocus: args.revealFocus,
    });
    const content = [
      ...header,
      ...viewport.lines,
      renderScrollIndicator(args.theme, viewport, args.width, scrollHint(args)),
    ];
    return {
      lines: frameLines(args.theme, content, width),
      viewport: { ...viewport, overflow: true },
    };
  }

  return renderTinyFrame(options);
}

function renderTinyFrame(options: {
  args: RenderFormFrameArgs;
  width: number;
  maxHeight: number;
  fullContent: string[];
  fullFocusedRange?: FormLineRange;
}): RenderedFormFrame {
  const { args, width, maxHeight, fullContent, fullFocusedRange } = options;
  if (maxHeight <= FRAME_BORDER_ROWS) {
    const viewport = layoutFormViewport({
      lines: fullContent,
      maxRows: maxHeight,
      scrollOffset: args.scrollOffset,
      focusedRange: fullFocusedRange,
      revealFocus: args.revealFocus,
    });
    return {
      lines: truncateLines(viewport.lines, width),
      viewport: { ...viewport, overflow: true },
    };
  }

  const showIndicator = maxHeight >= FRAME_BORDER_ROWS + SCROLL_INDICATOR_ROWS + 1;
  const viewport = layoutFormViewport({
    lines: fullContent,
    maxRows: maxHeight - FRAME_BORDER_ROWS - (showIndicator ? SCROLL_INDICATOR_ROWS : 0),
    scrollOffset: args.scrollOffset,
    focusedRange: fullFocusedRange,
    revealFocus: args.revealFocus,
  });
  const content = showIndicator
    ? [
        ...viewport.lines,
        renderScrollIndicator(
          args.theme,
          viewport,
          Math.max(1, width - FRAME_HORIZONTAL_CHROME),
          scrollHint(args),
        ),
      ]
    : viewport.lines;
  return {
    lines: frameLines(args.theme, content, width),
    viewport: { ...viewport, overflow: true },
  };
}

function renderFrameBody(args: RenderFormFrameArgs): RenderedFormSection {
  const lines: string[] = [];
  const { intro } = args.controller.questionnaire;
  if (intro) {
    lines.push("");
    lines.push(...renderPrompt(intro, args.width));
    lines.push("");
    lines.push(args.theme.fg("borderMuted", "─".repeat(args.width)));
  }
  lines.push("");

  const section = renderActiveScreen(args);
  const focusedRange = offsetFormLineRange(section.focusedRange, lines.length);
  lines.push(...section.lines);
  return { lines, focusedRange };
}

function renderActiveScreen(args: RenderFormFrameArgs): RenderedFormSection {
  if (args.mode === "review") return renderReviewScreen(args);
  if (isEditorMode(args.mode)) return renderEditorScreen(args);
  return args.controller.currentQuestion.type === "text"
    ? renderTextScreen(args)
    : renderChoiceScreen(args);
}

function renderHeader(args: RenderFormFrameArgs): string[] {
  const { title } = args.controller.questionnaire;
  const titleText = args.theme.fg("accent", args.theme.bold(title ?? "ask_user"));
  const contextText = args.theme.fg("muted", headerContext(args));
  return [formatSplitLine(titleText, contextText, args.width), renderProgressLine(args)];
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

function completeViewport(lines: string[]): FormViewportLayout & { overflow: false } {
  return {
    lines,
    scrollOffset: 0,
    maxScrollOffset: 0,
    pageSize: Math.max(1, lines.length),
    hiddenAbove: 0,
    hiddenBelow: 0,
    overflow: false,
  };
}

function renderScrollIndicator(
  theme: Theme,
  viewport: FormViewportLayout,
  width: number,
  hint: string,
): string {
  const first = viewport.scrollOffset + 1;
  const last = viewport.scrollOffset + viewport.lines.length;
  const above = viewport.hiddenAbove > 0 ? "↑" : "·";
  const below = viewport.hiddenBelow > 0 ? "↓" : "·";
  const text =
    width < COMPACT_SCROLL_INDICATOR_WIDTH
      ? `${above} ${below}`
      : width < 20
        ? `${above}${viewport.hiddenAbove} ${below}${viewport.hiddenBelow}`
        : `${above}${viewport.hiddenAbove}  ${first}-${last}/${last + viewport.hiddenBelow}  ${hint} scroll  ${below}${viewport.hiddenBelow}`;
  return truncateToWidth(theme.fg("dim", text), width, "");
}

function scrollHint(args: RenderFormFrameArgs): string {
  return args.focus === "editor" ? "Alt+PgUp/PgDn" : "PgUp/PgDn";
}

function frameLines(theme: Theme, content: string[], width: number): string[] {
  const innerWidth = Math.max(1, width - FRAME_HORIZONTAL_CHROME);
  const border = theme.fg("borderAccent", "│");
  const top = theme.fg("borderAccent", `╭${"─".repeat(width - 2)}╮`);
  const bottom = theme.fg("borderAccent", `╰${"─".repeat(width - 2)}╯`);
  return [
    top,
    ...content.map((line) => `${border} ${padRight(line, innerWidth)} ${border}`),
    bottom,
  ].map((line) => truncateToWidth(line, width));
}

function truncateLines(lines: string[], width: number): string[] {
  return lines.map((line) => truncateToWidth(line, width));
}

function renderFooter(args: RenderFormFrameArgs): string {
  if (args.mode === "review") {
    return "Keys: ↑↓ move/edge scroll · Enter edit/submit · c form comment · ←/Shift+Tab back · Esc cancel";
  }

  if (isEditorMode(args.mode)) {
    return "Keys: Enter save · Esc discard";
  }

  const question = args.controller.currentQuestion;

  if (question.type === "text") {
    return "Keys: Enter submit · Alt+C question comment · Alt+U unanswered · Tab next · Shift+Tab back · Esc cancel";
  }

  if (question.multi) {
    return "Keys: ↑↓ move/edge scroll · Space toggle · Enter accept · c question comment · n option comment · u unanswered · ←/→ or Tab/Shift+Tab · Esc cancel";
  }

  return "Keys: ↑↓ move/edge scroll · Space select · Enter select · c question comment · n option comment · u unanswered · ←/→ or Tab/Shift+Tab · Esc cancel";
}

function isEditorMode(mode: FormMode): boolean {
  return mode === "question-comment" || mode === "form-comment" || mode === "option-comment";
}
