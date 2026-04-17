import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Editor } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { QuestionnaireFlow } from "./flow.ts";
import { DISCUSS_LABEL, OTHER_LABEL } from "./format.ts";
import type { NormalizedStructuredQuestion } from "./types.ts";
import type { OverlayRenderState } from "./ui-rich-render.ts";
import type { InteractiveRow } from "./ui-rich-state.ts";

export function structuredRowLabel(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  question: NormalizedStructuredQuestion,
  row: Extract<InteractiveRow, { kind: "other" | "discuss" }>,
): string {
  const label = row.kind === "other" ? OTHER_LABEL : DISCUSS_LABEL;
  const answer = flow.getAnswer(question.id);
  if (row.kind === "other" && answer?.source === "other") return `${label}: ${answer.value}`;
  if (row.kind === "discuss" && answer?.source === "discuss" && answer.value) {
    return `${label}: ${answer.value}`;
  }
  return label;
}

export function inlineStructuredRowLines(args: {
  width: number;
  theme: Theme;
  state: OverlayRenderState;
  editor: Editor;
  row: InteractiveRow;
  prefix: string;
}): string[] | undefined {
  const { width, theme, state, editor, row, prefix } = args;
  if (!isInlineStructuredInput(state, row)) return undefined;
  const label = row.kind === "other" ? OTHER_LABEL : DISCUSS_LABEL;
  return renderInlineEditorLines(width - visibleWidth(prefix), theme, editor, `${label}: `);
}

function isInlineStructuredInput(state: OverlayRenderState, row: InteractiveRow): boolean {
  return (
    (state.subMode === "other-input" && row.kind === "other") ||
    (state.subMode === "discuss-input" && row.kind === "discuss")
  );
}

function renderInlineEditorLines(
  width: number,
  theme: Theme,
  editor: Editor,
  prefix = "",
): string[] {
  const lines = editor.getLines();
  const cursor = editor.getCursor();
  return lines.map((line, index) => {
    const content = index === cursor.line ? highlightCursor(theme, line, cursor.col) : line;
    return truncateToWidth(`${prefix}${content}`, Math.max(1, width));
  });
}

function highlightCursor(theme: Theme, line: string, col: number): string {
  const before = line.slice(0, col);
  const current = line.slice(col, col + 1) || " ";
  const after = line.slice(col + 1);
  return `${before}${theme.bg("selectedBg", theme.fg("text", current))}${after}`;
}
