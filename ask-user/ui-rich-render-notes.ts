// Note-related rendering helpers for the rich overlay.

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { QuestionnaireFlow } from "./flow.ts";
import type { MultiSelection, NormalizedQuestion, NormalizedStructuredQuestion } from "./types.ts";
import type { OverlayRenderState } from "./ui-rich-render.ts";
import { type InteractiveRow, interactiveRows } from "./ui-rich-state.ts";

export function currentNote(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  state: OverlayRenderState,
  question: NormalizedQuestion | undefined,
): string | undefined {
  if (!question || question.type === "text") return undefined;
  const row = interactiveRows(question)[state.selectedIndex];
  if (!row || row.kind !== "option") return undefined;
  if (question.type === "multichoice")
    return noteForMultiOption(flow, state, question, row.optionIndex);
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
  if (question.type === "multichoice")
    return !!noteForMultiOption(flow, state, question, row.optionIndex);
  return active && !!noteForSingle(flow, state, question);
}

export function noteForSingle(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  state: Pick<OverlayRenderState, "stagedSingleNotes">,
  question: Exclude<NormalizedStructuredQuestion, { type: "multichoice" }>,
): string | undefined {
  return state.stagedSingleNotes.get(question.id) ?? storedSingleNote(flow.getAnswer(question.id));
}

function storedSingleNote(
  answer: ReturnType<Pick<QuestionnaireFlow, "getAnswer">["getAnswer"]>,
): string | undefined {
  if (!answer) return undefined;
  if (answer.source === "option" || answer.source === "yesno") return answer.note;
  return undefined;
}

export function noteForMultiOption(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  state: Pick<OverlayRenderState, "stagedMultiNotes">,
  question: Extract<NormalizedStructuredQuestion, { type: "multichoice" }>,
  optionIndex: number,
): string | undefined {
  const staged = state.stagedMultiNotes.get(question.id)?.get(optionIndex);
  if (staged !== undefined) return staged;
  return storedMultiSelections(flow.getAnswer(question.id)).find(
    (selection) => selection.optionIndex === optionIndex,
  )?.note;
}

function storedMultiSelections(
  answer: ReturnType<Pick<QuestionnaireFlow, "getAnswer">["getAnswer"]>,
): MultiSelection[] {
  if (!answer || answer.source !== "options") return [];
  if (answer.selections.length > 0) return answer.selections;
  return answer.optionIndexes.map((optionIndex, index) => ({
    optionIndex,
    value: answer.values[index] ?? "",
  }));
}

export function renderNoteStatus(add: (text: string) => void, theme: Theme, note: string): void {
  add("");
  add(theme.fg("muted", ` Notes: ${note}`));
}
