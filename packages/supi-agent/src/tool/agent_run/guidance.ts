/** Selection guidance for the agent_run tool. */
export const toolDescription =
  "Delegate work with new: { profile }, or continue a saved conversation with continue: { conversationId } from agent_run or agent_list. New conversations do not inherit parent history. Each run adds only its new instructions and sharedContext. Collect completed background results with agent_result before continuing. Multi-task batches require read-only profiles; mutation-capable profiles require one foreground task.";
