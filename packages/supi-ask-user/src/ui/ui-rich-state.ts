// Shared state types and pure helpers for the rich overlay.

import type { Editor } from "@mariozechner/pi-tui";
import type { QuestionnaireFlow } from "../flow.ts";
import type { OverlayRenderState, SubMode } from "../render/ui-rich-render-types.ts";
import type {
  NormalizedQuestion,
  NormalizedStructuredQuestion,
  QuestionnaireOutcome,
} from "../types.ts";
import { isStructuredQuestion, primaryRecommendationIndex } from "../types.ts";

export interface NoteTargetSingle {
  mode: "single";
  questionId: string;
}

export interface NoteTargetMulti {
  mode: "multi";
  questionId: string;
  optionIndex: number;
}

export type NoteTarget = NoteTargetSingle | NoteTargetMulti;

export interface OverlayState extends OverlayRenderState {
  noteTarget?: NoteTarget;
  cachedLines: string[] | undefined;
  cachedWidth: number | undefined;
  maxHeight: number;
}

export interface OverlayDeps {
  flow: QuestionnaireFlow;
  state: OverlayState;
  editor: Editor;
  refresh: () => void;
  finish: (o: QuestionnaireOutcome) => void;
}

export type InteractiveRow =
  | { kind: "option"; optionIndex: number }
  | { kind: "other" }
  | { kind: "discuss" };

export function interactiveRows(question: NormalizedStructuredQuestion): InteractiveRow[] {
  const rows: InteractiveRow[] = question.options.map((_, optionIndex) => ({
    kind: "option",
    optionIndex,
  }));
  if (question.allowOther) rows.push({ kind: "other" });
  if (question.allowDiscuss) rows.push({ kind: "discuss" });
  return rows;
}

export function rowCount(question: NormalizedQuestion): number {
  return isStructuredQuestion(question) ? interactiveRows(question).length : 0;
}

export function hasPreview(question: NormalizedQuestion): boolean {
  return isStructuredQuestion(question) && question.options.some((option) => !!option.preview);
}

export function initialSubMode(question: NormalizedQuestion | undefined): SubMode {
  if (!question) return "select";
  return question.type === "text" ? "text-input" : "select";
}

export function resetStateForCurrent(deps: OverlayDeps): void {
  const question = deps.flow.currentQuestion;
  deps.state.subMode = deps.flow.currentMode === "reviewing" ? "select" : initialSubMode(question);
  deps.state.selectedIndex = selectedRowIndex(deps.flow, question);
  deps.state.noteTarget = undefined;
  deps.state.maxHeight = 0;
  deps.editor.setText("");
}

export function existingStructuredInputValue(
  flow: QuestionnaireFlow,
  questionId: string,
  kind: "other" | "discuss",
): string {
  const answer = flow.getAnswer(questionId);
  if (kind === "other") return answer?.source === "other" ? answer.value : "";
  return answer?.source === "discuss" ? (answer.value ?? "") : "";
}

export function singleNoteFromAnswer(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  questionId: string,
): string | undefined {
  const answer = flow.getAnswer(questionId);
  if (!answer) return undefined;
  if (answer.source === "option" || answer.source === "yesno") return answer.note;
  return undefined;
}

export function multiNoteMapFromAnswer(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  questionId: string,
): Map<number, string> {
  const answer = flow.getAnswer(questionId);
  const map = new Map<number, string>();
  if (!answer || answer.source !== "options") return map;
  for (const selection of answer.selections) {
    if (selection.note) map.set(selection.optionIndex, selection.note);
  }
  return map;
}

export function mergedMultiNoteMap(deps: OverlayDeps, questionId: string): Map<number, string> {
  const answerMap = multiNoteMapFromAnswer(deps.flow, questionId);
  const staged = deps.state.stagedMultiNotes.get(questionId);
  if (!staged) return answerMap;
  const merged = new Map(answerMap);
  for (const [optionIndex, note] of staged.entries()) merged.set(optionIndex, note);
  return merged;
}

export function isEditorMode(mode: SubMode): boolean {
  return (
    mode === "text-input" ||
    mode === "other-input" ||
    mode === "discuss-input" ||
    mode === "note-input"
  );
}

export function selectedIndexesForQuestion(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  state: Pick<OverlayRenderState, "stagedSelections">,
  question: NormalizedStructuredQuestion,
): number[] {
  const answer = flow.getAnswer(question.id);
  if (answer?.source === "other" || answer?.source === "discuss") return [];
  const staged = state.stagedSelections.get(question.id);
  if (staged) return [...staged];
  if (!answer) return [];
  if (answer.source === "option" || answer.source === "yesno") return [answer.optionIndex];
  if (answer.source === "options") return [...answer.optionIndexes];
  return [];
}

export function selectedRowIndex(
  flow: Pick<QuestionnaireFlow, "getAnswer">,
  question: NormalizedQuestion | undefined,
): number {
  if (!question || question.type === "text") return 0;
  const rows = interactiveRows(question);
  const answer = flow.getAnswer(question.id);
  if (!answer) {
    const recommended = primaryRecommendationIndex(question);
    return recommended ?? 0;
  }
  switch (answer.source) {
    case "option":
    case "yesno":
      return answer.optionIndex;
    case "options":
      return answer.optionIndexes[0] ?? 0;
    case "other":
      return rows.findIndex((row) => row.kind === "other");
    case "discuss":
      return rows.findIndex((row) => row.kind === "discuss");
    case "text":
      return 0;
  }
}
