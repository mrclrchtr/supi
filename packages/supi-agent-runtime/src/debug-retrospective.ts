import type { Usage } from "@earendil-works/pi-ai";
import {
  buildToolSelectionPrompt,
  canRecordAgentRunRetrospective,
  recordDebugEvent,
} from "@mrclrchtr/supi-core/debug";
import type { AgentRunRetrospective } from "./types.ts";

/**
 * Increment whenever RETROSPECTIVE_PROMPT changes so evidence collectors can
 * separate assessments answering different questions.
 */
export const RETROSPECTIVE_PROMPT_REVISION = 6;

// Compact, tool-free adaptation of supi-debug's interactive /supi-tooling-retro prompt.
const RETROSPECTIVE_INTRO = `Reflect briefly on the task you just completed. Based only on the context available from this run, what would have made it more token/time efficient or more effective?

Focus on missing or unnecessary context from the parent, unclear tool guidance, suboptimal tool results, and tool failures or misuse. For each useful finding, name the observed friction and the specific change that might help. Clearly distinguish observations from untested suggestions. Do not invent savings estimates or generic recommendations. If nothing notable occurred, say so.`;

const RETROSPECTIVE_CLOSING = `The task result has already been published. Do not continue the task, submit another result, use tools, or repeat sensitive task content unnecessarily. Return only this retrospective.`;

/**
 * Build the assessment prompt. The shared Tool Selection question for Code Intelligence
 * (`code_*`) and `codemode` appears only when the run had those tools, so the reasons
 * for their non-use can be compared across runs and with `/supi-tooling-retro` ([#687](https://github.com/mrclrchtr/supi/issues/687)).
 */
export function buildRetrospectivePrompt(availableTools: readonly string[]): string {
  const toolSelection = buildToolSelectionPrompt(availableTools);
  return [
    RETROSPECTIVE_INTRO,
    ...(toolSelection ? [toolSelection] : []),
    RETROSPECTIVE_CLOSING,
  ].join("\n\n");
}

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
    prompt: ({ availableTools }) => buildRetrospectivePrompt(availableTools),
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
