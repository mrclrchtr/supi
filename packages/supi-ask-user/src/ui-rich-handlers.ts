// Input handlers for the rich overlay questionnaire UI.

import { Key, matchesKey } from "@mariozechner/pi-tui";
import type { NormalizedQuestion, NormalizedStructuredQuestion } from "./types.ts";
import { currentNote, currentRowSupportsNotes } from "./ui-rich-render-notes.ts";
import {
  existingStructuredInputValue,
  interactiveRows,
  isEditorMode,
  mergedMultiNoteMap,
  multiNoteMapFromAnswer,
  type OverlayDeps,
  resetStateForCurrent,
  rowCount,
  selectedIndexesForQuestion,
  singleNoteFromAnswer,
} from "./ui-rich-state.ts";

export function onEditorSubmit(value: string, deps: OverlayDeps): void {
  const question = deps.flow.currentQuestion;
  if (!question) return;
  const trimmed = value.trim();
  const { state, editor, refresh } = deps;
  if (state.subMode === "text-input") {
    if (trimmed.length === 0 && question.required) return;
    deps.flow.setAnswer({ questionId: question.id, source: "text", value: trimmed });
    moveAfterAnswer(deps);
    return;
  }
  if (state.subMode === "other-input") {
    if (trimmed.length === 0) {
      state.subMode = "select";
      editor.setText("");
      refresh();
      return;
    }
    clearStructuredDrafts(question, deps);
    deps.flow.setAnswer({ questionId: question.id, source: "other", value: trimmed });
    moveAfterAnswer(deps);
    return;
  }
  if (state.subMode === "discuss-input") {
    clearStructuredDrafts(question, deps);
    deps.flow.setAnswer(
      trimmed.length > 0
        ? { questionId: question.id, source: "discuss", value: trimmed }
        : { questionId: question.id, source: "discuss" },
    );
    moveAfterAnswer(deps);
    return;
  }
  if (state.subMode === "note-input") {
    applyNoteEdit(trimmed, deps);
    state.subMode = "select";
    state.noteTarget = undefined;
    editor.setText("");
    refresh();
  }
}

function applyNoteEdit(note: string, deps: OverlayDeps): void {
  const { flow, state } = deps;
  const target = state.noteTarget;
  if (!target) return;
  if (target.mode === "single") {
    if (note.length > 0) state.stagedSingleNotes.set(target.questionId, note);
    else state.stagedSingleNotes.delete(target.questionId);
    return;
  }
  const existing = new Map(
    state.stagedMultiNotes.get(target.questionId) ??
      multiNoteMapFromAnswer(flow, target.questionId),
  );
  if (note.length > 0) existing.set(target.optionIndex, note);
  else existing.delete(target.optionIndex);
  if (existing.size > 0) state.stagedMultiNotes.set(target.questionId, existing);
  else state.stagedMultiNotes.delete(target.questionId);
}

function clearStructuredDrafts(question: NormalizedQuestion, deps: OverlayDeps): void {
  if (question.type !== "multichoice") return;
  deps.state.stagedSelections.delete(question.id);
  deps.state.stagedMultiNotes.delete(question.id);
}

function handleInlineEditorNav(data: string, deps: OverlayDeps): boolean {
  const { state, flow } = deps;
  if (
    (state.subMode !== "other-input" && state.subMode !== "discuss-input") ||
    (!matchesKey(data, Key.up) && !matchesKey(data, Key.down))
  ) {
    return false;
  }
  const question = flow.currentQuestion;
  if (!question || question.type === "text") return false;
  const maxIndex = Math.max(0, rowCount(question) - 1);
  const nextIndex = matchesKey(data, Key.up)
    ? Math.max(0, state.selectedIndex - 1)
    : Math.min(maxIndex, state.selectedIndex + 1);
  state.subMode = "select";
  deps.editor.setText("");
  moveSelection(question, nextIndex, deps);
  return true;
}

export function handleOverlayInput(data: string, deps: OverlayDeps): void {
  const { state, flow } = deps;
  if (isEditorMode(state.subMode)) {
    if (state.subMode === "text-input" && matchesKey(data, Key.ctrl("s")) && flow.showSkip) {
      handleSkipAction(deps);
      return;
    }
    if (matchesKey(data, Key.escape)) {
      handleEditorEscape(deps);
      return;
    }
    if (handleInlineEditorNav(data, deps)) return;
    deps.editor.handleInput(data);
    deps.refresh();
    return;
  }
  if (matchesKey(data, Key.escape)) {
    flow.cancel();
    deps.finish(flow.outcome());
    return;
  }
  if (flow.currentMode === "reviewing") {
    handleReviewInput(data, deps);
    return;
  }
  handleSelectInput(data, deps);
}

function handleEditorEscape(deps: OverlayDeps): void {
  const { state, editor, flow, refresh } = deps;
  if (state.subMode === "text-input") {
    const question = flow.currentQuestion;
    if (question && !question.required) {
      flow.advance();
      if (flow.isTerminal()) {
        deps.finish(flow.outcome());
        return;
      }
      resetStateForCurrent(deps);
      refresh();
      return;
    }
    flow.cancel();
    deps.finish(flow.outcome());
    return;
  }
  state.subMode = "select";
  state.noteTarget = undefined;
  editor.setText("");
  refresh();
}

function handleSelectInput(data: string, deps: OverlayDeps): void {
  const { flow, state } = deps;
  const question = flow.currentQuestion;
  if (!question) return;
  const maxIndex = Math.max(0, rowCount(question) - 1);
  if (matchesKey(data, Key.up)) {
    moveSelection(question, Math.max(0, state.selectedIndex - 1), deps);
    return;
  }
  if (matchesKey(data, Key.down)) {
    moveSelection(question, Math.min(maxIndex, state.selectedIndex + 1), deps);
    return;
  }
  if (handleSelectNav(data, deps)) return;
  if (question.type === "multichoice" && matchesKey(data, Key.space)) {
    toggleCurrentSelection(question, deps);
    return;
  }
  if (matchesKey(data, "n") && currentRowSupportsNotes(question, state)) {
    openNoteEditor(question, deps);
    return;
  }
  if (matchesKey(data, Key.enter)) {
    handleSelectEnter(question, deps);
    return;
  }
  if (matchesKey(data, "s") && flow.showSkip) {
    handleSkipAction(deps);
    return;
  }
}

/** Skip action shared by Ctrl-S (text-input) and 's' (select) handlers. */
function handleSkipAction(deps: OverlayDeps): void {
  const { flow } = deps;
  const question = flow.currentQuestion;
  if (flow.isMultiQuestion && question && !question.required && !flow.hasAnswer(question.id)) {
    flow.advance();
    if (flow.isTerminal()) {
      deps.finish(flow.outcome());
      return;
    }
    resetStateForCurrent(deps);
    deps.refresh();
    return;
  }
  flow.skip();
  deps.finish(flow.outcome());
}

function openNoteEditor(question: NormalizedQuestion, deps: OverlayDeps): void {
  if (question.type === "text") return;
  const row = interactiveRows(question)[deps.state.selectedIndex];
  if (!row || row.kind !== "option") return;
  deps.state.subMode = "note-input";
  deps.state.noteTarget =
    question.type === "multichoice"
      ? { mode: "multi", questionId: question.id, optionIndex: row.optionIndex }
      : { mode: "single", questionId: question.id };
  deps.editor.setText(currentNote(deps.flow, deps.state, question) ?? "");
  deps.refresh();
}

function handleSelectNav(data: string, deps: OverlayDeps): boolean {
  const { flow, refresh } = deps;
  if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
    if (flow.goBack()) {
      resetStateForCurrent(deps);
      refresh();
    }
    return true;
  }
  if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
    const question = flow.currentQuestion;
    if (flow.allRequiredAnswered() && flow.enterReview()) {
      refresh();
    } else if (question && !question.required && !flow.hasAnswer(question.id) && flow.advance()) {
      resetStateForCurrent(deps);
      refresh();
    }
    return true;
  }
  return false;
}

function handleSelectEnter(question: NormalizedQuestion, deps: OverlayDeps): void {
  if (question.type === "text") return;
  const row = interactiveRows(question)[deps.state.selectedIndex];
  if (!row) return;
  if (row.kind === "option") {
    if (question.type === "multichoice") {
      handleSubmitSelections(question, deps);
      return;
    }
    handleOptionRow(question, row.optionIndex, deps);
    return;
  }
  openStructuredInput(question, row.kind, deps);
}

function handleOptionRow(
  question: NormalizedStructuredQuestion,
  optionIndex: number,
  deps: OverlayDeps,
): void {
  if (question.type === "multichoice") {
    toggleSelection(question, optionIndex, deps);
    deps.refresh();
    return;
  }
  const option = question.options[optionIndex];
  const note =
    deps.state.stagedSingleNotes.get(question.id) ?? singleNoteFromAnswer(deps.flow, question.id);
  deps.flow.setAnswer(
    question.type === "yesno"
      ? {
          questionId: question.id,
          source: "yesno",
          value: option.value as "yes" | "no",
          optionIndex: optionIndex as 0 | 1,
          note,
        }
      : {
          questionId: question.id,
          source: "option",
          value: option.value,
          optionIndex,
          note,
        },
  );
  moveAfterAnswer(deps);
}

function toggleCurrentSelection(
  question: Extract<NormalizedStructuredQuestion, { type: "multichoice" }>,
  deps: OverlayDeps,
): void {
  const row = interactiveRows(question)[deps.state.selectedIndex];
  if (!row || row.kind !== "option") return;
  toggleSelection(question, row.optionIndex, deps);
  deps.refresh();
}

function openStructuredInput(
  question: NormalizedStructuredQuestion,
  kind: "other" | "discuss",
  deps: OverlayDeps,
): void {
  deps.state.subMode = kind === "other" ? "other-input" : "discuss-input";
  deps.editor.setText(existingStructuredInputValue(deps.flow, question.id, kind));
  deps.refresh();
}

function moveSelection(question: NormalizedQuestion, nextIndex: number, deps: OverlayDeps): void {
  const { state, refresh } = deps;
  if (state.selectedIndex === nextIndex) {
    refresh();
    return;
  }
  state.selectedIndex = nextIndex;
  if (question.type === "text") {
    refresh();
    return;
  }
  const row = interactiveRows(question)[nextIndex];
  if (row?.kind === "other" || row?.kind === "discuss") {
    openStructuredInput(question, row.kind, deps);
    return;
  }
  refresh();
}

function toggleSelection(
  question: NormalizedStructuredQuestion,
  optionIndex: number,
  deps: OverlayDeps,
): void {
  const existing = new Set(selectedIndexesForQuestion(deps.flow, deps.state, question));
  if (existing.has(optionIndex)) existing.delete(optionIndex);
  else existing.add(optionIndex);
  deps.state.stagedSelections.set(
    question.id,
    [...existing].sort((a, b) => a - b),
  );
}

function handleSubmitSelections(question: NormalizedStructuredQuestion, deps: OverlayDeps): void {
  if (question.type !== "multichoice") return;
  const indexes = selectedIndexesForQuestion(deps.flow, deps.state, question);
  if (indexes.length === 0) return;
  const noteMap = mergedMultiNoteMap(deps, question.id);
  const selections = indexes.map((optionIndex) => ({
    value: question.options[optionIndex].value,
    optionIndex,
    note: noteMap.get(optionIndex),
  }));
  deps.flow.setAnswer({
    questionId: question.id,
    source: "options",
    values: selections.map((s) => s.value),
    optionIndexes: selections.map((s) => s.optionIndex),
    selections,
  });
  moveAfterAnswer(deps);
}

function handleReviewInput(data: string, deps: OverlayDeps): void {
  const { flow, refresh } = deps;
  if (matchesKey(data, Key.enter)) {
    if (flow.submit()) deps.finish(flow.outcome());
    return;
  }
  if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left) || matchesKey(data, "b")) {
    if (flow.goBack()) {
      resetStateForCurrent(deps);
      refresh();
    }
    return;
  }
  if (matchesKey(data, "s") && flow.showSkip) {
    flow.skip();
    deps.finish(flow.outcome());
  }
}

export function moveAfterAnswer(deps: OverlayDeps): void {
  deps.flow.advance();
  if (deps.flow.isTerminal()) {
    deps.finish(deps.flow.outcome());
    return;
  }
  resetStateForCurrent(deps);
  deps.refresh();
}
