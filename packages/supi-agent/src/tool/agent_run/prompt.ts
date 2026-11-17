import type { ResolvedTask } from "./batch-preflight.ts";

/** Build the next child input without replaying the original task or tool actions. */
export function buildChildPrompt(task: ResolvedTask, sharedContext?: string): string {
  const sections: string[] = [];
  if (task.parentCheckpointId !== null) {
    sections.push(
      `Follow-up for "${task.conversationLabel}". Earlier findings describe a changing workspace; check current files before relying on them. Previous tool handles and process resources may have expired.`,
    );
    if (task.previousRunStatus && task.previousRunStatus !== "completed") {
      const reason = task.previousFailureCode ? ` (${task.previousFailureCode})` : "";
      sections.push(
        `The previous Agent Run ended ${task.previousRunStatus}${reason}. Earlier actions may be incomplete or uncertain. Check actual state before repeating an action. Do not replay interrupted actions.`,
      );
    }
  }
  if (task.requestedCwd !== undefined) {
    // Some providers describe their own process cwd (the parent's) as the working directory.
    sections.push(
      `Your tools run in ${task.inputs.cwd}. This overrides any other working directory named in your environment; use relative paths without a cd prefix.`,
    );
  }
  const context = sharedContext?.trim();
  if (context) {
    // Shared context is written for the whole batch; the label tells the child which part is its own.
    sections.push(`Context shared by every task in this batch:\n${context}`);
    sections.push(`Your task:\n${task.instructions}`);
  } else {
    sections.push(task.instructions);
  }
  return sections.join("\n\n");
}
