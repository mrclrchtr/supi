// Validates raw `ask_user` parameters and lowers them into the shared internal
// questionnaire model. Both UI paths and result formatting consume only this
// normalized model, so the overlay and dialog flows cannot drift apart.

import type { AskUserParams, ExternalQuestion } from "./schema.ts";
import {
  type NormalizedOption,
  type NormalizedQuestion,
  type NormalizedQuestionnaire,
  QUESTION_LIMITS,
} from "./types.ts";

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

function normalizeChoice(q: {
  type: "choice";
  id: string;
  header: string;
  prompt: string;
  required?: boolean;
  multi?: boolean;
  options: { value: string; label: string; description?: string; preview?: string }[];
  allowOther?: boolean;
  allowDiscuss?: boolean;
  recommendation?: string | string[];
  default?: string | string[];
}): NormalizedQuestion {
  const id = q.id.trim();
  const options = normalizeStructuredOptions(id, q.options);
  const multi = q.multi ?? false;
  const recommendation = q.recommendation;
  const defaultValue = q.default;

  validateRecDefaultShape(id, recommendation, multi, "recommendation");
  validateRecDefaultShape(id, defaultValue, multi, "default");

  return {
    id,
    header: q.header,
    type: "choice",
    prompt: q.prompt,
    required: q.required ?? true,
    multi,
    options,
    allowOther: q.allowOther ?? false,
    allowDiscuss: q.allowDiscuss ?? false,
    recommendedIndexes: resolveRecDefault(id, options, recommendation, multi, "recommendation"),
    defaultIndexes: resolveRecDefault(id, options, defaultValue, multi, "default"),
  };
}

function validateRecDefaultShape(
  questionId: string,
  value: string | string[] | undefined,
  multi: boolean,
  kind: string,
): void {
  if (value === undefined) return;
  if (!multi && Array.isArray(value)) {
    throw new AskUserValidationError(
      `single-select question "${questionId}" ${kind} must be a string, not an array.`,
    );
  }
  if (multi && !Array.isArray(value)) {
    throw new AskUserValidationError(
      `multi-select question "${questionId}" ${kind} must be an array, not a string.`,
    );
  }
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
  options: { value: string; label: string; description?: string; preview?: string }[],
): NormalizedOption[] {
  const optionCount = options.length;
  if (
    optionCount < QUESTION_LIMITS.minChoiceOptions ||
    optionCount > QUESTION_LIMITS.maxChoiceOptions
  ) {
    throw new AskUserValidationError(
      `choice question "${questionId}" must have ${QUESTION_LIMITS.minChoiceOptions}-${QUESTION_LIMITS.maxChoiceOptions} options (got ${optionCount}).`,
    );
  }
  const seenValues = new Set<string>();
  return options.map((opt) => {
    const value = opt.value.trim();
    if (value.length === 0 || opt.label.trim().length === 0) {
      throw new AskUserValidationError(
        `choice question "${questionId}" has an option with empty value or label.`,
      );
    }
    if (seenValues.has(value)) {
      throw new AskUserValidationError(
        `choice question "${questionId}" has duplicate option value "${value}".`,
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

// biome-ignore lint/complexity/useMaxParams: five distinct positional params are cleaner than a non-reusable options object for this internal helper
function resolveRecDefault(
  questionId: string,
  options: NormalizedOption[],
  value: string | string[] | undefined,
  multi: boolean,
  kind: "recommendation" | "default",
): number[] {
  if (value === undefined) return [];
  const verb = kind === "recommendation" ? "recommends" : "defaults to";
  if (!multi) {
    const trimmed = (value as string).trim();
    const idx = options.findIndex((opt) => opt.value === trimmed);
    if (idx < 0) {
      throw new AskUserValidationError(
        `choice question "${questionId}" ${verb} "${trimmed}", which is not one of its option values.`,
      );
    }
    return [idx];
  }
  const values = value as string[];
  if (values.length === 0) return [];
  const seen = new Set<string>();
  return values.map((v) => {
    const trimmed = v.trim();
    if (seen.has(trimmed)) {
      throw new AskUserValidationError(
        `choice question "${questionId}" has duplicate ${kind === "recommendation" ? "recommended" : "default"} value "${trimmed}".`,
      );
    }
    seen.add(trimmed);
    const idx = options.findIndex((opt) => opt.value === trimmed);
    if (idx < 0) {
      throw new AskUserValidationError(
        `choice question "${questionId}" ${verb} "${trimmed}", which is not one of its option values.`,
      );
    }
    return idx;
  });
}
