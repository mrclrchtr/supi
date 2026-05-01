// Dialog/input fallback for environments where ctx.ui.custom() is unavailable.
// This path intentionally preserves the redesigned answer semantics while
// flattening preview-heavy affordances into plain dialog lists.

import { QuestionnaireFlow } from "./flow.ts";
import { DISCUSS_LABEL, decorateOption, formatReviewLine, OTHER_LABEL } from "./format.ts";
import type {
  Answer,
  NormalizedQuestion,
  NormalizedStructuredQuestion,
  QuestionnaireOutcome,
} from "./types.ts";

export interface FallbackDialogOptions {
  signal?: AbortSignal;
}

export interface FallbackUi {
  select(
    title: string,
    options: string[],
    opts?: FallbackDialogOptions,
  ): Promise<string | undefined>;
  input(
    title: string,
    placeholder?: string,
    opts?: FallbackDialogOptions,
  ): Promise<string | undefined>;
}

interface RunOptions {
  ui: FallbackUi;
  signal?: AbortSignal;
}

type StepOutcome = "answered" | "cancelled" | "aborted";
type CollectOutcome = Exclude<StepOutcome, "answered">;
type ReviewOutcome =
  | { kind: "submit" }
  | { kind: "cancelled" }
  | { kind: "aborted" }
  | { kind: "revise"; questionIndex: number };

const REVIEW_SUBMIT = "Submit answers";
const REVIEW_CANCEL = "Cancel questionnaire";
const MULTI_SUBMIT = "Submit selections";

interface FallbackLoopState {
  revisingFromReview: boolean;
}

export async function runFallbackQuestionnaire(
  questions: NormalizedQuestion[],
  options: RunOptions,
): Promise<QuestionnaireOutcome> {
  const flow = new QuestionnaireFlow(questions);
  const state: FallbackLoopState = { revisingFromReview: false };
  while (!flow.isTerminal()) {
    if (abortIfNeeded(flow, options.signal)) break;
    if (await handleReviewMode(flow, options, state)) continue;
    if (!(await handleAnsweringMode(flow, options, state))) break;
  }
  return flow.outcome();
}

function abortIfNeeded(flow: QuestionnaireFlow, signal: AbortSignal | undefined): boolean {
  if (!signal?.aborted) return false;
  flow.abort();
  return true;
}

async function handleReviewMode(
  flow: QuestionnaireFlow,
  opts: RunOptions,
  state: FallbackLoopState,
): Promise<boolean> {
  if (flow.currentMode !== "reviewing") return false;
  const review = await runReviewStep(flow, opts);
  applyReviewOutcome(flow, review, state);
  return true;
}

function applyReviewOutcome(
  flow: QuestionnaireFlow,
  review: ReviewOutcome,
  state: FallbackLoopState,
): void {
  if (review.kind === "aborted") {
    flow.abort();
    return;
  }
  if (review.kind === "cancelled") {
    flow.cancel();
    return;
  }
  if (review.kind === "submit") {
    flow.submit();
    return;
  }
  jumpToQuestion(flow, review.questionIndex);
  state.revisingFromReview = true;
}

async function handleAnsweringMode(
  flow: QuestionnaireFlow,
  opts: RunOptions,
  state: FallbackLoopState,
): Promise<boolean> {
  const question = flow.currentQuestion;
  if (!question) return false;
  const step = await askAndStore(question, flow, opts);
  applyStepOutcome(flow, step, state);
  return true;
}

function applyStepOutcome(
  flow: QuestionnaireFlow,
  step: StepOutcome,
  state: FallbackLoopState,
): void {
  if (step === "aborted") {
    flow.abort();
    return;
  }
  if (step === "cancelled") {
    flow.cancel();
    return;
  }
  if (state.revisingFromReview) {
    state.revisingFromReview = false;
    if (!flow.enterReview()) flow.advance();
    return;
  }
  flow.advance();
}

async function runReviewStep(flow: QuestionnaireFlow, opts: RunOptions): Promise<ReviewOutcome> {
  const summary = flow.questions
    .map(
      (question) =>
        `${question.header}: ${formatReviewLine(question, flow.getAnswer(question.id))}`,
    )
    .join("  |  ");
  const reviseLabels = flow.questions.map((question, index) =>
    reviewReviseLabel(index, question.header),
  );
  const labels = [REVIEW_SUBMIT, ...reviseLabels, REVIEW_CANCEL];
  const choice = await opts.ui.select(`Review answers — ${summary}`, labels, {
    signal: opts.signal,
  });
  if (opts.signal?.aborted) return { kind: "aborted" };
  if (choice === undefined || choice === REVIEW_CANCEL) return { kind: "cancelled" };
  if (choice === REVIEW_SUBMIT) return { kind: "submit" };
  const questionIndex = reviseLabels.indexOf(choice);
  if (questionIndex >= 0) return { kind: "revise", questionIndex };
  return { kind: "cancelled" };
}

function jumpToQuestion(flow: QuestionnaireFlow, questionIndex: number): void {
  if (flow.currentMode === "reviewing") flow.goBack();
  while (flow.currentIndex > questionIndex) {
    if (!flow.goBack()) break;
  }
}

async function askAndStore(
  question: NormalizedQuestion,
  flow: QuestionnaireFlow,
  opts: RunOptions,
): Promise<StepOutcome> {
  const answer = await collectAnswer(question, opts);
  if (answer === "aborted" || answer === "cancelled") return answer;
  flow.setAnswer(answer);
  return "answered";
}

function collectAnswer(
  question: NormalizedQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  if (question.type === "text") return collectText(question, opts);
  if (question.type === "multichoice") return collectMultichoice(question, opts);
  return collectStructured(question, opts, question.type === "yesno" ? "yesno" : "option");
}

async function collectText(
  question: Extract<NormalizedQuestion, { type: "text" }>,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  while (true) {
    const value = await opts.ui.input(question.prompt, undefined, { signal: opts.signal });
    if (opts.signal?.aborted) return "aborted";
    if (value === undefined) return "cancelled";
    const trimmed = value.trim();
    if (trimmed.length > 0) return { questionId: question.id, source: "text", value: trimmed };
  }
}

async function collectStructured(
  question: NormalizedStructuredQuestion,
  opts: RunOptions,
  source: "option" | "yesno",
): Promise<Answer | CollectOutcome> {
  const labels = structuredChoiceLabels(question);
  const choice = await opts.ui.select(question.prompt, labels, { signal: opts.signal });
  if (opts.signal?.aborted) return "aborted";
  if (choice === undefined) return "cancelled";
  const index = labels.indexOf(choice);
  if (index < 0) return "cancelled";
  if (index < question.options.length) {
    const option = question.options[index];
    return source === "yesno"
      ? {
          questionId: question.id,
          source: "yesno",
          value: option.value as "yes" | "no",
          optionIndex: index as 0 | 1,
        }
      : { questionId: question.id, source: "option", value: option.value, optionIndex: index };
  }
  return collectStructuredAction(question, index - question.options.length, opts);
}

function structuredChoiceLabels(question: NormalizedStructuredQuestion): string[] {
  const labels = question.options.map((option, index) =>
    numberedLabel(
      index,
      appendDescription(
        decorateOption(option.label, question.recommendedIndexes.includes(index)),
        option.description,
      ),
    ),
  );
  let offset = question.options.length;
  if (question.allowOther) {
    labels.push(numberedLabel(offset, OTHER_LABEL));
    offset += 1;
  }
  if (question.allowDiscuss) labels.push(numberedLabel(offset, DISCUSS_LABEL));
  return labels;
}

async function collectStructuredAction(
  question: NormalizedStructuredQuestion,
  actionIndex: number,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  if (question.allowOther && actionIndex === 0) return collectOther(question, opts);
  return collectDiscuss(question, opts);
}

async function collectOther(
  question: NormalizedStructuredQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  while (true) {
    const value = await opts.ui.input(`${question.prompt} (${OTHER_LABEL})`, undefined, {
      signal: opts.signal,
    });
    if (opts.signal?.aborted) return "aborted";
    if (value === undefined) return "cancelled";
    const trimmed = value.trim();
    if (trimmed.length > 0) return { questionId: question.id, source: "other", value: trimmed };
  }
}

async function collectDiscuss(
  question: NormalizedStructuredQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  const value = await opts.ui.input(`${question.prompt} (${DISCUSS_LABEL})`, "Optional context", {
    signal: opts.signal,
  });
  if (opts.signal?.aborted) return "aborted";
  if (value === undefined) return "cancelled";
  const trimmed = value.trim();
  return trimmed.length > 0
    ? { questionId: question.id, source: "discuss", value: trimmed }
    : { questionId: question.id, source: "discuss" };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fallback multiselect loop is intentionally linear
async function collectMultichoice(
  question: Extract<NormalizedQuestion, { type: "multichoice" }>,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  const selected = new Set<number>();
  while (true) {
    const labels = multichoiceLabels(question, selected);
    const choice = await opts.ui.select(question.prompt, labels, { signal: opts.signal });
    if (opts.signal?.aborted) return "aborted";
    if (choice === undefined) return "cancelled";
    const index = labels.indexOf(choice);
    if (index < 0) return "cancelled";
    if (index < question.options.length) {
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
      continue;
    }
    const submitIndex = question.options.length;
    if (index === submitIndex) {
      if (selected.size === 0) continue;
      const optionIndexes = [...selected].sort((a, b) => a - b);
      const selections = optionIndexes.map((optionIndex) => ({
        optionIndex,
        value: question.options[optionIndex].value,
      }));
      return {
        questionId: question.id,
        source: "options",
        values: selections.map((selection) => selection.value),
        optionIndexes,
        selections,
      };
    }
    return collectStructuredAction(question, index - submitIndex - 1, opts);
  }
}

function multichoiceLabels(
  question: Extract<NormalizedQuestion, { type: "multichoice" }>,
  selected: Set<number>,
): string[] {
  const labels = question.options.map((option, index) => {
    const checked = selected.has(index) ? "[x]" : "[ ]";
    const recommended = question.recommendedIndexes.includes(index);
    return numberedLabel(
      index,
      appendDescription(
        `${checked} ${decorateOption(option.label, recommended)}`,
        option.description,
      ),
    );
  });
  let offset = question.options.length;
  labels.push(numberedLabel(offset, MULTI_SUBMIT));
  offset += 1;
  if (question.allowOther) {
    labels.push(numberedLabel(offset, OTHER_LABEL));
    offset += 1;
  }
  if (question.allowDiscuss) labels.push(numberedLabel(offset, DISCUSS_LABEL));
  return labels;
}

function numberedLabel(index: number, label: string): string {
  return `${index + 1}. ${label}`;
}

function reviewReviseLabel(index: number, header: string): string {
  return `Revise question ${index + 1} — ${header}`;
}

function appendDescription(label: string, description: string | undefined): string {
  return description ? `${label} — ${description}` : label;
}
