/** Maximum UTF-16 code-unit length of one debug identity string. */
export const MAX_DEBUG_IDENTITY_STRING = 512;

/** Marker appended to a truncated debug identity string. */
export const DEBUG_IDENTITY_TRUNCATION_MARKER = "…";

/** Bound one debug identity string, including its truncation marker. */
export function truncateDebugIdentity(value: string): string {
  if (value.length <= MAX_DEBUG_IDENTITY_STRING) return value;
  return `${value.slice(0, MAX_DEBUG_IDENTITY_STRING - 1)}${DEBUG_IDENTITY_TRUNCATION_MARKER}`;
}
