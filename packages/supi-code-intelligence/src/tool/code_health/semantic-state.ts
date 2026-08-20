import type { SemanticHealthState } from "../../session/health-types.ts";

/** Format the authoritative semantic-health state for Markdown and TUI status chrome. */
export function formatSemanticHealthState(state: SemanticHealthState | null): string {
  if (!state) return "not evaluated";
  return state.kind === "ready" ? "ready" : `${state.kind} — ${state.reason}`;
}

/** Read semantic-health state from untyped PI result details. */
export function readSemanticHealthState(value: unknown): SemanticHealthState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "ready") return { kind: "ready" };
  if (
    (record.kind === "pending" ||
      record.kind === "inactive" ||
      record.kind === "disabled" ||
      record.kind === "unavailable") &&
    typeof record.reason === "string"
  ) {
    return { kind: record.kind, reason: record.reason };
  }
  return null;
}
