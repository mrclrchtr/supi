import { REVIEW_LIMITS } from "./review-limits.ts";
import type { ReviewInput, ReviewTask } from "./types.ts";

const REVIEW_INPUT_FIELDS = new Set(["sharedContext", "tasks"]);
const REVIEW_TASK_FIELDS = new Set(["id", "instructions", "mode"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnsupportedFields(
  value: Record<string, unknown>,
  allowedFields: Set<string>,
  label: string,
): void {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) throw new Error(`${label} field ${field} is not supported.`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value.trim();
}

/** Canonicalize and semantically validate review input for every adapter. */
export function normalizeReviewInput(review: ReviewInput): ReviewInput {
  if (!isRecord(review)) throw new Error("Review input must be an object.");
  rejectUnsupportedFields(review, REVIEW_INPUT_FIELDS, "Review input");
  if (!Array.isArray(review.tasks)) throw new Error("Review input tasks must be an array.");
  const rawSharedContext: unknown = review.sharedContext;
  if (rawSharedContext !== undefined && typeof rawSharedContext !== "string") {
    throw new Error("Shared review context must be a string.");
  }
  const sharedContext = rawSharedContext?.trim();
  const tasks: ReviewTask[] = review.tasks.map((task: unknown): ReviewTask => {
    if (!isRecord(task)) throw new Error("Each Review Task must be an object.");
    rejectUnsupportedFields(task, REVIEW_TASK_FIELDS, "Review Task");
    const id = requiredString(task.id, "Review Task id");
    const instructions = requiredString(task.instructions, "Review Task instructions");
    const mode = task.mode;
    if (mode !== "change" && mode !== "state") {
      throw new Error('Review task mode must be "change" or "state".');
    }
    return { id, instructions, mode };
  });
  if (tasks.length < 1 || tasks.length > 4) {
    throw new Error("Provide between one and four review tasks.");
  }
  if (tasks.some((task) => !task.id || !task.instructions)) {
    throw new Error("Review task ids and instructions must not be blank.");
  }
  if (tasks.some((task) => task.id.length > REVIEW_LIMITS.taskIdCharacters)) {
    throw new Error(
      `Review task ids must not exceed ${REVIEW_LIMITS.taskIdCharacters} characters.`,
    );
  }
  if (tasks.some((task) => task.instructions.length > REVIEW_LIMITS.taskInstructionCharacters)) {
    throw new Error(
      `Review task instructions must not exceed ${REVIEW_LIMITS.taskInstructionCharacters.toLocaleString("en-US")} characters.`,
    );
  }
  if (sharedContext && sharedContext.length > REVIEW_LIMITS.sharedContextCharacters) {
    throw new Error(
      `Shared review context must not exceed ${REVIEW_LIMITS.sharedContextCharacters.toLocaleString("en-US")} characters.`,
    );
  }
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error("Review task ids must be unique.");
  }
  return { ...(sharedContext ? { sharedContext } : {}), tasks };
}
