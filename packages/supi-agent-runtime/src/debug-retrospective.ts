import { canRecordAgentRunRetrospective, recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import type { AgentRunRetrospective } from "./types.ts";

// Compact, tool-free adaptation of supi-debug's interactive /supi-tooling-retro prompt.
const RETROSPECTIVE_PROMPT = `Reflect briefly on the task you just completed. Based only on the context available from this run, what would have made it more token/time efficient or more effective?

Focus on missing or unnecessary context from the parent, unclear tool guidance, suboptimal tool results, and tool failures or misuse. For each useful finding, name the observed friction and the specific change that might help. Clearly distinguish observations from untested suggestions. Do not invent savings estimates or generic recommendations. If nothing notable occurred, say so.

The task result has already been published. Do not continue the task, submit another result, use tools, or repeat sensitive task content unnecessarily. Return only this retrospective.`;

/**
 * Opt a caller into the existing Debug evidence path only when capture, explicit
 * retrospective permission, and a persistence sink are active. The runtime
 * rechecks that permission before publishing a result and beginning assessment.
 */
export function createDebugAgentRunRetrospective(input: {
  readonly source: string;
  readonly runKey: string;
  readonly cwd: string;
}): AgentRunRetrospective | undefined {
  if (!canRecordAgentRunRetrospective()) return undefined;
  return {
    prompt: RETROSPECTIVE_PROMPT,
    isEnabled: canRecordAgentRunRetrospective,
    onResult: (result) => {
      const { usage, ...assessment } = result;
      recordDebugEvent({
        source: input.source,
        cwd: input.cwd,
        category: "agent-run-retrospective",
        level: result.status === "completed" ? "info" : "warning",
        message: "Agent Run retrospective",
        data: {
          runKey: input.runKey,
          caller: input.source,
          ...assessment,
          // Avoid secret-like "token" keys in the shared Debug sanitizer.
          ...(usage
            ? {
                usage: {
                  input: usage.input,
                  output: usage.output,
                  cacheRead: usage.cacheRead,
                  cacheWrite: usage.cacheWrite,
                  total: usage.totalTokens,
                  cost: usage.cost,
                },
              }
            : {}),
        },
      });
    },
  };
}
