// Dialog/input fallback for environments where ctx.ui.custom() is unavailable
// (e.g., RPC mode). Sequentially walks the QuestionnaireFlow via select/
// confirm/input. Honors signal.aborted between dialogs and treats user
// dismissal (undefined return) as cancellation.

import { QuestionnaireFlow } from "./flow.ts";
import { decorateOption, formatReviewLine, OTHER_LABEL } from "./format.ts";
import type { Answer, NormalizedQuestion, QuestionnaireOutcome } from "./types.ts";

export interface FallbackDialogOptions {
  signal?: AbortSignal;
}

export interface FallbackUi {
  select(
    title: string,
    options: string[],
    opts?: FallbackDialogOptions,
  ): Promise<string | undefined>;
  confirm(title: string, message: string, opts?: FallbackDialogOptions): Promise<boolean>;
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

const COMMENT_PROMPT_PLACEHOLDER = "Optional note (leave blank to skip)";
const COMMENT_YES_LABEL = "Yes, add a note";
const COMMENT_NO_LABEL = "No, skip";

type StepOutcome = "answered" | "cancelled" | "aborted";
type CollectOutcome = Exclude<StepOutcome, "answered">;

export async function runFallbackQuestionnaire(
  questions: NormalizedQuestion[],
  options: RunOptions,
): Promise<QuestionnaireOutcome> {
  const flow = new QuestionnaireFlow(questions);
  while (!flow.isTerminal()) {
    if (options.signal?.aborted) {
      flow.abort();
      break;
    }
    const q = flow.currentQuestion;
    if (!q) break;
    const step = await askAndStore(q, flow, options);
    if (step === "aborted") flow.abort();
    else if (step === "cancelled") flow.cancel();
    else await applyAdvance(flow, options);
  }
  return flow.outcome();
}

async function applyAdvance(flow: QuestionnaireFlow, opts: RunOptions): Promise<void> {
  flow.advance();
  if (flow.currentMode !== "reviewing" || !flow.allAnswered()) return;
  const review = await runReviewStep(flow, opts);
  if (review === "aborted") flow.abort();
  else if (review === "cancelled") flow.cancel();
  else flow.submit();
}

const REVIEW_SUBMIT = "Submit answers";
const REVIEW_CANCEL = "Cancel questionnaire";

async function runReviewStep(
  flow: QuestionnaireFlow,
  opts: RunOptions,
): Promise<"submit" | "cancelled" | "aborted"> {
  const summary = flow.questions
    .map((q) => `${q.header}: ${formatReviewLine(q, flow.getAnswer(q.id))}`)
    .join("  |  ");
  const choice = await opts.ui.select(
    `Review answers — ${summary}`,
    [REVIEW_SUBMIT, REVIEW_CANCEL],
    { signal: opts.signal },
  );
  if (opts.signal?.aborted) return "aborted";
  if (choice === undefined || choice === REVIEW_CANCEL) return "cancelled";
  return "submit";
}

async function askAndStore(
  question: NormalizedQuestion,
  flow: QuestionnaireFlow,
  opts: RunOptions,
): Promise<StepOutcome> {
  const answer = await collectAnswer(question, opts);
  if (answer === "aborted" || answer === "cancelled") return answer;
  const comment = await collectComment(question, opts);
  if (comment === "aborted" || comment === "cancelled") return comment;
  if (comment) answer.comment = comment;
  flow.setAnswer(answer);
  return "answered";
}

function collectAnswer(
  question: NormalizedQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  if (question.type === "yesno") return collectYesNo(question, opts);
  if (question.type === "text") return collectText(question, opts);
  return collectChoice(question, opts);
}

function collectYesNo(
  question: NormalizedQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  return collectStructured(question, opts, "yesno");
}

async function collectText(
  question: NormalizedQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  while (true) {
    const value = await opts.ui.input(question.prompt, undefined, { signal: opts.signal });
    if (opts.signal?.aborted) return "aborted";
    if (value === undefined) return "cancelled";
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return { questionId: question.id, source: "text", value: trimmed };
    }
  }
}

function collectChoice(
  question: NormalizedQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  return collectStructured(question, opts, "option");
}

async function collectStructured(
  question: NormalizedQuestion,
  opts: RunOptions,
  source: "option" | "yesno",
): Promise<Answer | CollectOutcome> {
  // Prefix every label with `${i + 1}.` so duplicate or recommendation-decorated
  // labels can never collide on indexOf() reverse-lookup. Append option
  // description inline — the select dialog has no separate description channel,
  // but dropping descriptions entirely makes terse/repeated labels ambiguous.
  const optionLabels = question.options.map((o, i) =>
    numberedLabel(
      i,
      appendDescription(decorateOption(o.label, i === question.recommendedIndex), o.description),
    ),
  );
  const otherIndex = question.allowOther ? question.options.length : -1;
  const allLabels = question.allowOther
    ? [...optionLabels, numberedLabel(otherIndex, OTHER_LABEL)]
    : optionLabels;
  const choice = await opts.ui.select(question.prompt, allLabels, { signal: opts.signal });
  if (opts.signal?.aborted) return "aborted";
  if (choice === undefined) return "cancelled";
  const pickedIdx = allLabels.indexOf(choice);
  if (pickedIdx < 0) return "cancelled";
  if (question.allowOther && pickedIdx === otherIndex) return collectOther(question, opts);
  return {
    questionId: question.id,
    source,
    value: question.options[pickedIdx].value,
    optionIndex: pickedIdx,
  };
}

function numberedLabel(idx: number, label: string): string {
  return `${idx + 1}. ${label}`;
}

async function collectOther(
  question: NormalizedQuestion,
  opts: RunOptions,
): Promise<Answer | CollectOutcome> {
  // Blank input reprompts (matches the text-question loop and the rich UI).
  // Only a dismissed dialog (`undefined`) cancels the questionnaire.
  while (true) {
    const free = await opts.ui.input(`${question.prompt} (Other)`, undefined, {
      signal: opts.signal,
    });
    if (opts.signal?.aborted) return "aborted";
    if (free === undefined) return "cancelled";
    const trimmed = free.trim();
    if (trimmed.length > 0) {
      return { questionId: question.id, source: "other", value: trimmed };
    }
  }
}

async function collectComment(
  question: NormalizedQuestion,
  opts: RunOptions,
): Promise<string | "aborted" | "cancelled"> {
  // Text questions are freeform already — skip the comment prompt.
  if (question.type === "text") return "";
  // Use select() instead of confirm() so a dismissed dialog returns undefined
  // and can be treated as cancellation. confirm()'s boolean return collapses
  // "no" and "dismiss" together, which would silently submit on user cancel.
  const choice = await opts.ui.select(
    `${question.header}: add a note?`,
    [COMMENT_YES_LABEL, COMMENT_NO_LABEL],
    { signal: opts.signal },
  );
  if (opts.signal?.aborted) return "aborted";
  if (choice === undefined) return "cancelled";
  if (choice === COMMENT_NO_LABEL) return "";
  const note = await opts.ui.input(`${question.header} note`, COMMENT_PROMPT_PLACEHOLDER, {
    signal: opts.signal,
  });
  if (opts.signal?.aborted) return "aborted";
  if (note === undefined) return "cancelled";
  return note.trim();
}

function appendDescription(label: string, description: string | undefined): string {
  return description ? `${label} — ${description}` : label;
}
