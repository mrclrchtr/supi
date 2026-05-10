// Validates raw `ask_user` parameters and lowers them into the shared internal
// questionnaire model. Both UI paths and result formatting consume only this
// normalized model, so the overlay and dialog flows cannot drift apart.

import type {
  AskUserParams,
  ExternalChoiceQuestion,
  ExternalMultiChoiceQuestion,
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
  return {
    questions: params.questions.map((q) => normalizeQuestion(q)),
    allowSkip: params.allowSkip ?? false,
  };
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
    const questionId = q.id.trim();
    if (questionId.length === 0) continue;
    if (seen.has(questionId)) {
      throw new AskUserValidationError(
        `Duplicate question id "${questionId}" — question ids must be unique within a questionnaire.`,
      );
    }
    seen.add(questionId);
  }
}

function normalizeQuestion(q: ExternalQuestion): NormalizedQuestion {
  validateCommonFields(q);
  switch (q.type) {
    case "choice":
      return normalizeChoice(q);
    case "multichoice":
      return normalizeMultiChoice(q);
    case "yesno":
      return normalizeYesNo(q);
    case "text":
      return normalizeText(q);
  }
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
  const id = q.id.trim();
  const options = normalizeStructuredOptions(id, q.options);
  return {
    id,
    header: q.header,
    type: "choice",
    prompt: q.prompt,
    required: q.required ?? true,
    options,
    allowOther: q.allowOther ?? false,
    allowDiscuss: q.allowDiscuss ?? false,
    recommendedIndexes: resolveSingleRecommendation(id, options, q.recommendation),
  };
}

function normalizeMultiChoice(q: ExternalMultiChoiceQuestion): NormalizedQuestion {
  const id = q.id.trim();
  const options = normalizeStructuredOptions(id, q.options);
  return {
    id,
    header: q.header,
    type: "multichoice",
    prompt: q.prompt,
    required: q.required ?? true,
    options,
    allowOther: q.allowOther ?? false,
    allowDiscuss: q.allowDiscuss ?? false,
    recommendedIndexes: resolveMultiRecommendation(id, options, q.recommendation),
  };
}

function normalizeYesNo(q: ExternalYesNoQuestion): NormalizedQuestion {
  return {
    id: q.id.trim(),
    header: q.header,
    type: "yesno",
    prompt: q.prompt,
    required: q.required ?? true,
    options: YES_NO_OPTIONS.map((option) => ({ ...option })),
    allowOther: q.allowOther ?? false,
    allowDiscuss: q.allowDiscuss ?? false,
    recommendedIndexes: q.recommendation === undefined ? [] : [q.recommendation === "yes" ? 0 : 1],
  };
}

function normalizeText(q: {
  id: string;
  header: string;
  prompt: string;
  required?: boolean;
  default?: string;
}): NormalizedQuestion {
  return {
    id: q.id.trim(),
    header: q.header,
    type: "text",
    prompt: q.prompt,
    required: q.required ?? true,
    options: [],
    ...(q.default !== undefined ? { default: q.default.trim() } : {}),
  };
}

function normalizeStructuredOptions(
  questionId: string,
  options: ExternalChoiceQuestion["options"] | ExternalMultiChoiceQuestion["options"],
): NormalizedOption[] {
  const optionCount = options.length;
  if (
    optionCount < QUESTION_LIMITS.minChoiceOptions ||
    optionCount > QUESTION_LIMITS.maxChoiceOptions
  ) {
    throw new AskUserValidationError(
      `structured question "${questionId}" must have ${QUESTION_LIMITS.minChoiceOptions}-${QUESTION_LIMITS.maxChoiceOptions} options (got ${optionCount}).`,
    );
  }
  const seenValues = new Set<string>();
  return options.map((opt) => {
    const value = opt.value.trim();
    if (value.length === 0 || opt.label.trim().length === 0) {
      throw new AskUserValidationError(
        `structured question "${questionId}" has an option with empty value or label.`,
      );
    }
    if (seenValues.has(value)) {
      throw new AskUserValidationError(
        `structured question "${questionId}" has duplicate option value "${value}".`,
      );
    }
    seenValues.add(value);
    return {
      value,
      label: opt.label,
      description: opt.description,
      preview: opt.preview,
    };
  });
}

function resolveSingleRecommendation(
  questionId: string,
  options: NormalizedOption[],
  recommendation: string | undefined,
): number[] {
  if (recommendation === undefined) return [];
  const value = recommendation.trim();
  const idx = options.findIndex((opt) => opt.value === value);
  if (idx < 0) {
    throw new AskUserValidationError(
      `choice question "${questionId}" recommends "${value}", which is not one of its option values.`,
    );
  }
  return [idx];
}

function resolveMultiRecommendation(
  questionId: string,
  options: NormalizedOption[],
  recommendation: string[] | undefined,
): number[] {
  if (!recommendation || recommendation.length === 0) return [];
  const seen = new Set<string>();
  return recommendation.map((recommendationValue) => {
    const value = recommendationValue.trim();
    if (seen.has(value)) {
      throw new AskUserValidationError(
        `multichoice question "${questionId}" has duplicate recommended value "${value}".`,
      );
    }
    seen.add(value);
    const idx = options.findIndex((opt) => opt.value === value);
    if (idx < 0) {
      throw new AskUserValidationError(
        `multichoice question "${questionId}" recommends "${value}", which is not one of its option values.`,
      );
    }
    return idx;
  });
}
