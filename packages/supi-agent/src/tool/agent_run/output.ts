import { HUMAN_LANE_MAX_CHARS, MODEL_LANE_MAX_CHARS } from "./bounds.ts";

function truncationMarker(originalLength: number): string {
  return `\n\n[truncated: ${originalLength.toLocaleString("en-US")} total characters]`;
}

function capText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = truncationMarker(text.length);
  return text.slice(0, Math.max(0, limit - marker.length)) + marker;
}

/** Cap model-visible text. Discloses truncation when applied. */
export function capModelText(text: string): string {
  return capText(text, MODEL_LANE_MAX_CHARS);
}

/** Return the number of characters by which text exceeded the cap. */
export function modelTextOverflow(text: string): number {
  return Math.max(0, text.length - MODEL_LANE_MAX_CHARS);
}

/** Cap human-visible text. Discloses truncation when applied. */
export function capHumanText(text: string): string {
  return capText(text, HUMAN_LANE_MAX_CHARS);
}

/** Return the number of characters by which text exceeded the human cap. */
export function humanTextOverflow(text: string): number {
  return Math.max(0, text.length - HUMAN_LANE_MAX_CHARS);
}
