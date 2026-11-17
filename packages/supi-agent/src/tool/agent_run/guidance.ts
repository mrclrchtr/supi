/** Selection guidance for the agent_run tool. */
export const toolDescription =
  "Delegate work with new: { profile, cwd? }, or continue a saved conversation with continue: { conversationId } from agent_run or agent_list. New conversations do not inherit parent history. Each run adds only its new instructions and sharedContext. Collect completed background results with agent_result before continuing. Multi-task batches require read-only profiles; mutation-capable profiles require one foreground task. agent_run is unavailable inside codemode; call it only directly.";

/** Optional reminders for the calling agent; they reach it only through Pi's default prompt. */
export const promptGuidelines: string[] = [
  "Check the paths and facts you pass to agent_run; the child cannot ask and spends calls on a wrong path.",
  "Name in agent_run instructions only the documents the task needs; long reading lists get skipped.",
];
