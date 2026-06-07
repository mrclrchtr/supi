import type { ReviewItem } from "../types.ts";

/** Format a `impact` or `effort` level value. */
export function formatLevel(value: ReviewItem["impact"] | ReviewItem["effort"]): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

/** Format a code location as a human-readable `file:line` or `file:start-end`. */
export function formatLocation(file: string, startLine: number, endLine: number): string {
  return `${file}:${startLine === endLine ? startLine : `${startLine}-${endLine}`}`;
}
