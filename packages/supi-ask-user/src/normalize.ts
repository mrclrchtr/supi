// Validation and normalization for ask_user tool calls.

import type {
  AskUserParams,
  ExternalChoiceQuestion,
  ExternalQuestion,
  ExternalTextQuestion,
} from "./schema.ts";
import {
  ASK_USER_LIMITS,
  type NormalizedChoiceQuestion,
  type NormalizedOption,
  type NormalizedQuestion,
  type NormalizedQuestionnaire,
  type NormalizedTextQuestion,
} from "./types.ts";

const DEPRECATED_TOP_LEVEL_KEYS = ["allowPartialSubmit"] as const;
const DEPRECATED_CHOICE_KEYS = ["required", "initial", "allowOther"] as const;
const DEPRECATED_TEXT_KEYS = ["required", "initial"] as const;

export class AskUserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AskUserValidationError";
  }
}

export function normalizeQuestionnaire(params: AskUserParams): NormalizedQuestionnaire {
  // Reject deprecated top-level fields
  for (const key of DEPRECATED_TOP_LEVEL_KEYS) {
    if (key in params) {
      throw new AskUserValidationError(
        `The "${key}" field is no longer supported. All questions are always required for a full submission. Use "needs_discussion" outcome for unanswered questions.`,
      );
    }
  }

  validateQuestionCount(params.questions.length);
  const title = trimOptional(params.title);
  const intro = trimOptional(params.intro);
  if (title && title.length > ASK_USER_LIMITS.maxTitleLength) {
    throw new AskUserValidationError(`title exceeds ${ASK_USER_LIMITS.maxTitleLength} characters.`);
  }
  if (intro && intro.length > ASK_USER_LIMITS.maxIntroLength) {
    throw new AskUserValidationError(`intro exceeds ${ASK_USER_LIMITS.maxIntroLength} characters.`);
  }

  const seen = new Set<string>();
  const questions = params.questions.map((question) => {
    const normalized = normalizeQuestion(question);
    if (seen.has(normalized.id)) {
      throw new AskUserValidationError(
        `Duplicate question id "${normalized.id}" — ids must be unique within one form.`,
      );
    }
    seen.add(normalized.id);
    return normalized;
  });

  return {
    ...(title ? { title } : {}),
    ...(intro ? { intro } : {}),
    questions,
  };
}

function normalizeQuestion(question: ExternalQuestion): NormalizedQuestion {
  validateCommonFields(question);
  return question.type === "choice" ? normalizeChoice(question) : normalizeText(question);
}

function validateQuestionCount(count: number): void {
  if (count < ASK_USER_LIMITS.minQuestions || count > ASK_USER_LIMITS.maxQuestions) {
    throw new AskUserValidationError(
      `ask_user supports ${ASK_USER_LIMITS.minQuestions}-${ASK_USER_LIMITS.maxQuestions} questions only (got ${count}).`,
    );
  }
}

function validateCommonFields(question: ExternalQuestion): void {
  const id = question.id.trim();
  const header = question.header.trim();
  const prompt = question.prompt.trim();

  if (!id) throw new AskUserValidationError("Question id must be a non-empty string.");
  if (!header) {
    throw new AskUserValidationError(`Question "${question.id}" must include a non-empty header.`);
  }
  if (header.length > ASK_USER_LIMITS.maxHeaderLength) {
    throw new AskUserValidationError(
      `Question "${question.id}" header exceeds ${ASK_USER_LIMITS.maxHeaderLength} characters.`,
    );
  }
  if (!prompt) {
    throw new AskUserValidationError(`Question "${question.id}" must include a non-empty prompt.`);
  }
  if (prompt.length > ASK_USER_LIMITS.maxPromptLength) {
    throw new AskUserValidationError(
      `Question "${question.id}" prompt exceeds ${ASK_USER_LIMITS.maxPromptLength} characters.`,
    );
  }
}

function normalizeChoice(question: ExternalChoiceQuestion): NormalizedChoiceQuestion {
  // Reject deprecated fields on choice questions
  for (const key of DEPRECATED_CHOICE_KEYS) {
    if (key in question) {
      throw new AskUserValidationError(
        `The "${key}" field on choice questions is no longer supported. Use "recommendation" for suggested options.`,
      );
    }
  }

  const options = normalizeOptions(question.id.trim(), question.options);
  const multi = question.multi ?? false;

  validateRecommendationShape(question.id, question.recommendation, multi);

  return {
    id: question.id.trim(),
    header: question.header.trim(),
    prompt: question.prompt.trim(),
    type: "choice",
    options,
    multi,
    recommendedIndexes: resolveIndexes({
      questionId: question.id,
      options,
      value: question.recommendation,
      multi,
      defaultToFirst: !multi,
    }),
  };
}

function normalizeText(question: ExternalTextQuestion): NormalizedTextQuestion {
  // Reject deprecated fields on text questions
  for (const key of DEPRECATED_TEXT_KEYS) {
    if (key in question) {
      throw new AskUserValidationError(
        `The "${key}" field on text questions is no longer supported. Use "recommendation" for suggested text.`,
      );
    }
  }

  const placeholder = trimOptional(question.placeholder);
  if (placeholder && placeholder.length > ASK_USER_LIMITS.maxPlaceholderLength) {
    throw new AskUserValidationError(
      `Question "${question.id}" placeholder exceeds ${ASK_USER_LIMITS.maxPlaceholderLength} characters.`,
    );
  }

  const recommendation = trimOptional(question.recommendation);

  return {
    id: question.id.trim(),
    header: question.header.trim(),
    prompt: question.prompt.trim(),
    type: "text",
    ...(recommendation ? { recommendation } : {}),
    ...(placeholder ? { placeholder } : {}),
  };
}

function normalizeOptions(
  questionId: string,
  options: ExternalChoiceQuestion["options"],
): NormalizedOption[] {
  if (
    options.length < ASK_USER_LIMITS.minChoiceOptions ||
    options.length > ASK_USER_LIMITS.maxChoiceOptions
  ) {
    throw new AskUserValidationError(
      `choice question "${questionId}" must have ${ASK_USER_LIMITS.minChoiceOptions}-${ASK_USER_LIMITS.maxChoiceOptions} options (got ${options.length}).`,
    );
  }

  const seen = new Set<string>();
  return options.map((option) => {
    const value = option.value.trim();
    const label = option.label.trim();
    if (!value || !label) {
      throw new AskUserValidationError(
        `choice question "${questionId}" has an option with empty value or label.`,
      );
    }
    if (seen.has(value)) {
      throw new AskUserValidationError(
        `choice question "${questionId}" has duplicate option value "${value}".`,
      );
    }
    seen.add(value);
    return {
      value,
      label,
      description: trimOptional(option.description),
      preview: trimOptional(option.preview),
    };
  });
}

function validateRecommendationShape(
  questionId: string,
  value: string | string[] | undefined,
  multi: boolean,
): void {
  if (value === undefined) return;
  if (multi && !Array.isArray(value)) {
    throw new AskUserValidationError(
      `multi-select question "${questionId}" recommendation must be an array, not a string.`,
    );
  }
  if (!multi && Array.isArray(value)) {
    throw new AskUserValidationError(
      `single-select question "${questionId}" recommendation must be a string, not an array.`,
    );
  }
}

function resolveIndexes(args: {
  questionId: string;
  options: NormalizedOption[];
  value: string | string[] | undefined;
  multi: boolean;
  defaultToFirst: boolean;
}): number[] {
  const { questionId, options, value, multi, defaultToFirst } = args;
  if (value === undefined) {
    return defaultToFirst ? [0] : [];
  }

  const values = multi ? (value as string[]) : [value as string];
  const seen = new Set<string>();
  return values.map((entry: string) => {
    const trimmed = entry.trim();
    if (seen.has(trimmed)) {
      throw new AskUserValidationError(
        `choice question "${questionId}" has duplicate recommendation value "${trimmed}".`,
      );
    }
    seen.add(trimmed);
    const index = options.findIndex((option) => option.value === trimmed);
    if (index < 0) {
      const allowed = options.map((option) => `"${option.value}"`).join(", ");
      throw new AskUserValidationError(
        `choice question "${questionId}" recommendation value "${trimmed}" does not match any option value. Allowed values: [${allowed}].`,
      );
    }
    return index;
  });
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
