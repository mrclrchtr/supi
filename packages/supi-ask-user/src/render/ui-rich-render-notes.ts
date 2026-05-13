// Note-related rendering helpers for the rich overlay.

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { QuestionnaireFlow } from "../flow.ts";
import type { NormalizedQuestion, NormalizedStructuredQuestion, Selection } from "../types.ts";
import { type InteractiveRow, interactiveRows } from "../ui/ui-rich-state.ts";
import type { OverlayRenderState } from "./ui-rich-render-types.ts";

export function currentNote(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  state: OverlayRenderState,
  question: NormalizedQuestion | undefined,
): string | undefined {
  if (!question || question.type === "text") return undefined;
  const row = interactiveRows(question)[state.selectedIndex];
  if (!row || row.kind !== "option") return undefined;
  if (question.multi) return noteForMultiOption(flow, state, question, row.optionIndex);
  return noteForSingle(flow, state, question);
}

export function currentRowSupportsNotes(
  question: NormalizedQuestion | undefined,
  state: Pick<OverlayRenderState, "selectedIndex">,
): boolean {
  if (!question || question.type === "text") return false;
  const row = interactiveRows(question)[state.selectedIndex];
  return row?.kind === "option";
}

export function visibleNoteMarker(args: {
  flow: Pick<QuestionnaireFlow, "getAnswer">;
  state: OverlayRenderState;
  question: NormalizedStructuredQuestion;
  row: Extract<InteractiveRow, { kind: "option" }>;
  active: boolean;
}): boolean {
  const { flow, state, question, row, active } = args;
  if (question.multi) return !!noteForMultiOption(flow, state, question, row.optionIndex);
  return active && !!noteForSingle(flow, state, question);
}

export function noteForSingle(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  state: Pick<OverlayRenderState, "stagedSingleNotes">,
  question: NormalizedStructuredQuestion,
): string | undefined {
  return state.stagedSingleNotes.get(question.id) ?? storedSingleNote(flow.getAnswer(question.id));
}

function storedSingleNote(
  answer: ReturnType<Pick<QuestionnaireFlow, "getAnswer">["getAnswer"]>,
): string | undefined {
  if (!answer || answer.source !== "choice") return undefined;
  return answer.selections[0]?.note;
}

export function noteForMultiOption(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  state: Pick<OverlayRenderState, "stagedMultiNotes">,
  question: NormalizedStructuredQuestion,
  optionIndex: number,
): string | undefined {
  const answer = flow.getAnswer(question.id);
  if (answer?.source === "other" || answer?.source === "discuss") return undefined;
  const staged = state.stagedMultiNotes.get(question.id)?.get(optionIndex);
  if (staged !== undefined) return staged;
  return storedMultiSelections(answer).find((selection) => selection.optionIndex === optionIndex)
    ?.note;
}

function storedMultiSelections(
  answer: ReturnType<Pick<QuestionnaireFlow, "getAnswer">["getAnswer"]>,
): Selection[] {
  if (!answer || answer.source !== "choice") return [];
  return answer.selections;
}

export function renderNoteStatus(theme: Theme, note: string): string[] {
  return ["", theme.fg("muted", ` Notes: ${note}`)];
}
