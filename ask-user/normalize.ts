// Validates raw `ask_user` parameters and lowers them into the shared internal
// questionnaire model. Both UI paths and result formatting consume only this
// normalized model, so the overlay and dialog flows cannot drift apart.

import type {
  AskUserParams,
  ExternalChoiceQuestion,
  ExternalQuestion,
  ExternalYesNoQuestion,
} from "./schema.ts";
import {
  type NormalizedOption,
  type NormalizedQuestion,
  type NormalizedQuestionnaire,
  QUESTION_LIMITS,
} from "./types.ts";

const YES_NO_OPTIONS: readonly NormalizedOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

export class AskUserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskUserValidationError";
  }
}

export function normalizeQuestionnaire(params: AskUserParams): NormalizedQuestionnaire {
  validateQuestionnaireShape(params);
  const questions = params.questions.map((q) => normalizeQuestion(q));
  return { questions };
}

function validateQuestionnaireShape(params: AskUserParams): void {
  const count = params.questions.length;
  if (count < QUESTION_LIMITS.minQuestions || count > QUESTION_LIMITS.maxQuestions) {
    throw new AskUserValidationError(
      `ask_user supports ${QUESTION_LIMITS.minQuestions}-${QUESTION_LIMITS.maxQuestions} questions only (got ${count}).`,
    );
  }
  const seen = new Set<string>();
  for (const q of params.questions) {
    if (seen.has(q.id)) {
      throw new AskUserValidationError(
        `Duplicate question id "${q.id}" — question ids must be unique within a questionnaire.`,
      );
    }
    seen.add(q.id);
  }
}

function normalizeQuestion(q: ExternalQuestion): NormalizedQuestion {
  validateCommonFields(q);
  if (q.type === "choice") return normalizeChoice(q);
  if (q.type === "yesno") return normalizeYesNo(q);
  return normalizeText(q);
}

function validateCommonFields(q: ExternalQuestion): void {
  if (q.id.trim().length === 0) {
    throw new AskUserValidationError("Question id must be a non-empty string.");
  }
  if (q.header.trim().length === 0) {
    throw new AskUserValidationError(`Question "${q.id}" must include a non-empty header.`);
  }
  if (q.header.length > QUESTION_LIMITS.maxHeaderLength) {
    throw new AskUserValidationError(
      `Question "${q.id}" header exceeds ${QUESTION_LIMITS.maxHeaderLength} characters.`,
    );
  }
  if (q.prompt.trim().length === 0) {
    throw new AskUserValidationError(`Question "${q.id}" must include a non-empty prompt.`);
  }
  if (q.prompt.length > QUESTION_LIMITS.maxPromptLength) {
    throw new AskUserValidationError(
      `Question "${q.id}" prompt exceeds ${QUESTION_LIMITS.maxPromptLength} characters.`,
    );
  }
}

function normalizeChoice(q: ExternalChoiceQuestion): NormalizedQuestion {
  const optionCount = q.options.length;
  if (
    optionCount < QUESTION_LIMITS.minChoiceOptions ||
    optionCount > QUESTION_LIMITS.maxChoiceOptions
  ) {
    throw new AskUserValidationError(
      `choice question "${q.id}" must have ${QUESTION_LIMITS.minChoiceOptions}-${QUESTION_LIMITS.maxChoiceOptions} options (got ${optionCount}).`,
    );
  }
  const seenValues = new Set<string>();
  const options: NormalizedOption[] = q.options.map((opt) => {
    if (opt.value.trim().length === 0 || opt.label.trim().length === 0) {
      throw new AskUserValidationError(
        `choice question "${q.id}" has an option with empty value or label.`,
      );
    }
    if (seenValues.has(opt.value)) {
      throw new AskUserValidationError(
        `choice question "${q.id}" has duplicate option value "${opt.value}".`,
      );
    }
    seenValues.add(opt.value);
    return { value: opt.value, label: opt.label, description: opt.description };
  });
  return {
    id: q.id,
    header: q.header,
    type: "choice",
    prompt: q.prompt,
    options,
    allowOther: q.allowOther === true,
    recommendedIndex: resolveChoiceRecommendation(q.id, options, q.recommendation),
  };
}

function resolveChoiceRecommendation(
  questionId: string,
  options: NormalizedOption[],
  recommendation: string | undefined,
): number | undefined {
  if (recommendation === undefined) return undefined;
  const idx = options.findIndex((opt) => opt.value === recommendation);
  if (idx < 0) {
    throw new AskUserValidationError(
      `choice question "${questionId}" recommends "${recommendation}", which is not one of its option values.`,
    );
  }
  return idx;
}

function normalizeYesNo(q: ExternalYesNoQuestion): NormalizedQuestion {
  const recommendedIndex =
    q.recommendation === undefined ? undefined : q.recommendation === "yes" ? 0 : 1;
  return {
    id: q.id,
    header: q.header,
    type: "yesno",
    prompt: q.prompt,
    options: YES_NO_OPTIONS.map((o) => ({ ...o })),
    allowOther: q.allowOther === true,
    recommendedIndex,
  };
}

function normalizeText(q: { id: string; header: string; prompt: string }): NormalizedQuestion {
  return {
    id: q.id,
    header: q.header,
    type: "text",
    prompt: q.prompt,
    options: [],
    allowOther: false,
    recommendedIndex: undefined,
  };
}
