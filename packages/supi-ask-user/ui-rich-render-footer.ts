// Footer help text generation for the rich overlay questionnaire UI.
// Extracted from ui-rich-render.ts to stay within Biome's per-file line limit.

import type { QuestionnaireFlow } from "./flow.ts";
import { currentNote, currentRowSupportsNotes } from "./ui-rich-render-notes.ts";
import type { OverlayRenderState } from "./ui-rich-render-types.ts";
import { isEditorMode, selectedIndexesForQuestion } from "./ui-rich-state.ts";

export function footerHelp(flow: QuestionnaireFlow, state: OverlayRenderState): string {
  if (state.subMode === "text-input") {
    const question = flow.currentQuestion;
    const parts = ["Enter to submit"];
    if (question && !question.required) parts.push("Esc skip question");
    else parts.push("Esc to cancel");
    if (flow.showSkip) parts.push("Ctrl-S skip");
    return parts.join(" • ");
  }
  if (isEditorMode(state.subMode)) return "Enter to submit • Esc to go back";
  if (flow.currentMode === "reviewing") {
    const base = "Enter to submit • ←/Shift-Tab to revise • Esc to cancel";
    return flow.showSkip ? `${base} • s to skip` : base;
  }
  const question = flow.currentQuestion;
  if (!question || question.type === "text") {
    const base = "Esc cancel";
    return flow.showSkip ? `${base} • s to skip` : base;
  }
  return structuredFooterHelp(flow, state, question);
}

function structuredFooterHelp(
  flow: QuestionnaireFlow,
  state: OverlayRenderState,
  question: NonNullable<QuestionnaireFlow["currentQuestion"]>,
): string {
  const canGoBack = flow.currentIndex > 0;
  const canAdvance =
    flow.allRequiredAnswered() || (!question.required && !flow.hasAnswer(question.id));
  const parts = ["↑↓ navigate"];
  if (question.type === "multichoice") {
    parts.push("Space toggle");
    if (selectedIndexesForQuestion(flow, state, question).length > 0) parts.push("Enter submit");
  } else {
    parts.push("Enter confirm/select");
  }
  if (currentRowSupportsNotes(question, state)) {
    parts.push(currentNote(flow, state, question) ? "n edit note" : "n add note");
  }
  if (canGoBack) parts.push("←/Shift-Tab back");
  if (canAdvance) parts.push("→/Tab next");
  if (flow.showSkip) parts.push("s skip");
  parts.push("Esc cancel");
  return parts.join(" • ");
}
