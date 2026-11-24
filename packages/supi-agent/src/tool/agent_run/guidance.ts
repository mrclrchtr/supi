/** Selection guidance for the agent_run tool. */
export const toolDescription =
  "Delegate work with new: { profile, cwd? }, or continue a saved conversation with continue: { conversationId } from agent_run or agent_list. New conversations do not inherit parent history. Each run adds only its new instructions and sharedContext. Collect completed background results with agent_result before continuing. A mutation-capable task in its own linked worktree (new.cwd outside the parent's and the main worktree) leases it and runs like a read-only task: in multi-task batches and in the background. Without new.cwd, or in the main worktree, it must be the only task of a foreground batch. Instead of new.cwd, new.worktree: { base?, branch? } creates a leased worktree on a new branch for a mutation-capable task and keeps it after the run. Each writer needs a different worktree. A lease is not a sandbox; worktrees still share Git refs, stash, config, hooks, ports, and temporary directories. agent_run is unavailable inside codemode; call it only directly.";

/** Optional reminders for the calling agent; they reach it only through Pi's default prompt. */
export const promptGuidelines: string[] = [
  "Check the paths and facts you pass to agent_run; the child cannot ask and spends calls on a wrong path.",
  "Name in agent_run instructions only the documents the task needs; long reading lists get skipped.",
];
