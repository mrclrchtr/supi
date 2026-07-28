import { REVIEW_LIMITS } from "./review-limits.ts";
import type { ReviewInput } from "./types.ts";

/** Canonicalize and semantically validate review input for every adapter. */
export function normalizeReviewInput(review: ReviewInput): ReviewInput {
  const sharedContext = review.sharedContext?.trim();
  const tasks = review.tasks.map((task) => ({
    id: task.id.trim(),
    instructions: task.instructions.trim(),
  }));
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
