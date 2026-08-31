import { clampThinkingLevel, type Model, type ModelThinkingLevel } from "@earendil-works/pi-ai";

/** PI thinking levels available in Review settings. */
export const REVIEW_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ModelThinkingLevel[];

/** A validated PI thinking level used by a Review child role. */
export type ReviewThinkingLevel = (typeof REVIEW_THINKING_LEVELS)[number];

/** Default reasoning budget for Reviewer Sessions. */
export const REVIEWER_DEFAULT_THINKING_LEVEL: ReviewThinkingLevel = "max";
/** Default reasoning budget for Planner Drafts. */
export const PLANNER_DEFAULT_THINKING_LEVEL: ReviewThinkingLevel = "low";

/** Review child role that can have a configured thinking level. */
export type ReviewThinkingRole = "Reviewer" | "Planner";

/**
 * Validate one configured role value at the point where that role is needed.
 * Missing values use the role's package default; invalid values fail closed.
 */
export function resolveReviewThinkingLevel(
  value: unknown,
  role: ReviewThinkingRole,
): ReviewThinkingLevel {
  if (value === undefined) {
    return role === "Reviewer" ? REVIEWER_DEFAULT_THINKING_LEVEL : PLANNER_DEFAULT_THINKING_LEVEL;
  }
  const normalized = typeof value === "string" ? value.trim() : undefined;
  if (normalized && REVIEW_THINKING_LEVELS.includes(normalized as ReviewThinkingLevel)) {
    return normalized as ReviewThinkingLevel;
  }
  throw new Error(
    `Invalid ${role} thinking level ${describeValue(value)}. Supported values: ${REVIEW_THINKING_LEVELS.join(", ")}.`,
  );
}

/** Clamp a requested Review level to the selected model's capabilities. */
export function clampReviewThinkingLevel(
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is PI's canonical type
  model: Model<any>,
  requested: ReviewThinkingLevel,
): ModelThinkingLevel {
  return clampThinkingLevel(model, requested);
}

function describeValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.slice(0, 120));
  try {
    const encoded = JSON.stringify(value);
    return (encoded ?? String(value)).slice(0, 120);
  } catch {
    return String(value).slice(0, 120);
  }
}
