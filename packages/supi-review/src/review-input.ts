import { REVIEW_LIMITS } from "./review-limits.ts";
import type { CriteriaSource, ReviewInput } from "./types.ts";

function normalizeCriteriaSources(
  taskId: string,
  sources?: CriteriaSource[],
): CriteriaSource[] | undefined {
  if (sources === undefined) return undefined;
  if (sources.length > REVIEW_LIMITS.criteriaSourcesPerTask) {
    throw new Error(
      `Review task ${taskId} may list at most ${REVIEW_LIMITS.criteriaSourcesPerTask} criteria sources.`,
    );
  }
  const normalized: CriteriaSource[] = [];
  const summaries = new Map<string, string>();
  for (const source of sources) {
    const reference = source.reference.trim();
    const summary = source.summary.trim();
    if (!reference || !summary) {
      throw new Error(
        `Review task ${taskId} criteria source references and summaries must not be blank.`,
      );
    }
    if (reference.length > REVIEW_LIMITS.criteriaReferenceCharacters) {
      throw new Error(
        `Review task ${taskId} criteria source reference must not exceed ${REVIEW_LIMITS.criteriaReferenceCharacters} characters.`,
      );
    }
    if (summary.length > REVIEW_LIMITS.criteriaSummaryCharacters) {
      throw new Error(
        `Review task ${taskId} criteria source summary must not exceed ${REVIEW_LIMITS.criteriaSummaryCharacters.toLocaleString("en-US")} characters.`,
      );
    }
    const previous = summaries.get(reference);
    if (previous !== undefined) {
      if (previous !== summary) {
        throw new Error(`Review task ${taskId} repeats criteria source ${reference}.`);
      }
      continue;
    }
    summaries.set(reference, summary);
    normalized.push({ reference, summary });
  }
  return normalized;
}

/** Canonicalize and semantically validate review input for every adapter. */
export function normalizeReviewInput(review: ReviewInput): ReviewInput {
  const sharedContext = review.sharedContext?.trim();
  const tasks = review.tasks.map((task) => {
    const criteriaSources = normalizeCriteriaSources(task.id.trim(), task.criteriaSources);
    return {
      id: task.id.trim(),
      instructions: task.instructions.trim(),
      ...(task.findingScope !== undefined ? { findingScope: task.findingScope } : {}),
      ...(criteriaSources ? { criteriaSources } : {}),
    };
  });
  if (tasks.length < 1 || tasks.length > 4) {
    throw new Error("Provide between one and four review tasks.");
  }
  if (tasks.some((task) => !task.id || !task.instructions)) {
    throw new Error("Review task ids and instructions must not be blank.");
  }
  if (
    tasks.some(
      (task) =>
        task.findingScope !== undefined &&
        task.findingScope !== "change-only" &&
        task.findingScope !== "boy-scout",
    )
  ) {
    throw new Error('Review task findingScope must be "change-only" or "boy-scout".');
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
