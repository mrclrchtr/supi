import type { AgentToolUpdateCallback } from "@earendil-works/pi-coding-agent";

/**
 * Emit a coarse progress beat to the agent runtime via `onUpdate`.
 *
 * Long-running code-intelligence executors (code_find ripgrep, code_impact
 * sweeps, code_graph `relations:["all"]`, code_health `refresh`, and
 * code_refactor_plan LSP requests) call this at a few natural checkpoints —
 * a start beat plus a couple of progress beats — so the UI can show the tool
 * is working. Beats must stay coarse: not chatty.
 *
 * Safe no-op when `onUpdate` is absent (the common case for direct executor
 * calls and tests). The `details.progress` marker mirrors the beat text for
 * UI rendering; the final tool result carries the real structured `details`.
 */
export function emitToolProgress(
  onUpdate: AgentToolUpdateCallback | undefined,
  text: string,
): void {
  onUpdate?.({ content: [{ type: "text", text }], details: { progress: text } });
}
