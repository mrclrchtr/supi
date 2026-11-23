import type { Usage } from "@earendil-works/pi-ai";
import { canRecordAgentRunRetrospective, recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import type { AgentRunRetrospective } from "./types.ts";

/**
 * Increment whenever RETROSPECTIVE_PROMPT changes so evidence collectors can
 * separate assessments answering different questions.
 */
export const RETROSPECTIVE_PROMPT_REVISION = 3;

// Compact, tool-free adaptation of supi-debug's interactive /supi-tooling-retro prompt.
const RETROSPECTIVE_PROMPT = `Reflect briefly on the task you just completed. Based only on the context available from this run, what would have made it more token/time efficient or more effective?

Focus on missing or unnecessary context from the parent, unclear tool guidance, suboptimal tool results, and tool failures or misuse. For each useful finding, name the observed friction and the specific change that might help. Clearly distinguish observations from untested suggestions. Do not invent savings estimates or generic recommendations. If nothing notable occurred, say so.

Mention Code Intelligence (\`code_*\`) tools only in these two cases. For each \`code_*\` call whose result was incomplete, oversized, ambiguous, or failed, report the tool, the problem, and the follow-up call it forced. If these tools were available and you answered a question about a code symbol (its definition, references, callers, or type) with another tool, name the question and say briefly why. Tool availability and call counts are recorded separately, so a statement that you made no such calls adds nothing.

The task result has already been published. Do not continue the task, submit another result, use tools, or repeat sensitive task content unnecessarily. Return only this retrospective.`;

/**
 * Opt a caller into the existing Debug evidence path only when capture, explicit
 * retrospective permission, and a persistence sink are active. The runtime
 * rechecks that permission before publishing a result and beginning assessment.
 * Caller identifiers and display labels are recorded in sanitized Debug data only;
 * never supply task instructions or inspected evidence as correlation metadata.
 */
export function createDebugAgentRunRetrospective(input: {
  readonly source: string;
  readonly runKey: string;
  readonly batchId: string;
  readonly taskId: string;
  readonly label: string;
  readonly conversationId?: string;
  readonly cwd: string;
}): AgentRunRetrospective | undefined {
  if (!canRecordAgentRunRetrospective()) return undefined;
  return {
    prompt: RETROSPECTIVE_PROMPT,
    isEnabled: canRecordAgentRunRetrospective,
    onResult: (result) => {
      const { usage, metrics, ...assessment } = result;
      const { usage: taskUsage, ...taskMetrics } = metrics;
      recordDebugEvent({
        source: input.source,
        cwd: input.cwd,
        category: "agent-run-retrospective",
        level: result.status === "completed" ? "info" : "warning",
        message: "Agent Run retrospective",
        data: {
          runKey: input.runKey,
          caller: input.source,
          batchId: input.batchId,
          taskId: input.taskId,
          label: input.label,
          promptRevision: RETROSPECTIVE_PROMPT_REVISION,
          ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
          ...assessment,
          // Task measurements; the sibling `usage` covers the assessment turn only.
          metrics: { ...taskMetrics, ...(taskUsage ? { usage: debugUsage(taskUsage) } : {}) },
          ...(usage ? { usage: debugUsage(usage) } : {}),
        },
      });
    },
  };
}

/** Avoid secret-like "token" keys in the shared Debug sanitizer. */
function debugUsage(usage: Usage) {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    total: usage.totalTokens,
    cost: usage.cost,
  };
}
