// Prompt surface for the agent_run tool.

export const toolDescription =
  "Delegate tasks to Agent Profiles in foreground. Read-only profiles can run concurrently; mutation-capable profiles require one task. Results keep task attribution and are limited to 2,000 lines or 50KB. Runs cannot execute in the background or delegate recursively.";
