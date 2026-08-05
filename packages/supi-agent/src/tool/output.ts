import { HUMAN_LANE_MAX_CHARS, MODEL_LANE_MAX_CHARS } from "./bounds.ts";

function truncationMarker(originalLength: number): string {
  return `\n\n[truncated: ${originalLength.toLocaleString("en-US")} total characters]`;
}

/** Cap model-visible text. Discloses truncation when applied. */
export function capModelText(text: string): string {
  if (text.length <= MODEL_LANE_MAX_CHARS) return text;
  return text.slice(0, MODEL_LANE_MAX_CHARS) + truncationMarker(text.length);
}

/** Return the number of characters by which text exceeded the cap. */
export function modelTextOverflow(text: string): number {
  return Math.max(0, text.length - MODEL_LANE_MAX_CHARS);
}

/** Cap human-visible text. Discloses truncation when applied. */
export function capHumanText(text: string): string {
  if (text.length <= HUMAN_LANE_MAX_CHARS) return text;
  return text.slice(0, HUMAN_LANE_MAX_CHARS) + truncationMarker(text.length);
}

/** Return the number of characters by which text exceeded the human cap. */
export function humanTextOverflow(text: string): number {
  return Math.max(0, text.length - HUMAN_LANE_MAX_CHARS);
}
