/** Model choices that Antigravity can expose to a new Consultation. */
export const CURATED_MODELS = Object.freeze([
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-high",
  "gemini-3.1-pro-high",
] as const);

/** A model in Antigravity's discovered catalogue. */
export type CuratedModel = (typeof CURATED_MODELS)[number];

/** Check whether an ID belongs to Antigravity's curated catalogue. */
export function isCuratedModel(value: unknown): value is CuratedModel {
  return typeof value === "string" && CURATED_MODELS.includes(value as CuratedModel);
}
