import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentRunOutcome, AgentRunStatus } from "@mrclrchtr/supi-agent-runtime/api";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";

/** Bounded timing totals for one tool in an Agent Run. */
export interface AgentToolTiming {
  toolName: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
}

/** Safe timing data for one completed Agent Run. */
export interface AgentRunTiming {
  elapsedMs: number;
  setupMs?: number;
  incompleteToolCount: number;
  maxConcurrentTools: number;
  maxToolsPerTurn: number;
  tools: AgentToolTiming[];
}

type ToolStart = { toolName: string; startedAt: number };
type MutableToolTiming = Omit<AgentToolTiming, "toolName">;

/** Collect timing data without retaining tool arguments or results. */
export class AgentRunTelemetry {
  readonly #startedAt: number;
  readonly #toolStarts = new Map<string, ToolStart>();
  readonly #tools = new Map<string, MutableToolTiming>();
  #runningAt: number | undefined;
  #toolsThisTurn = 0;
  #maxConcurrentTools = 0;
  #maxToolsPerTurn = 0;

  constructor(private readonly now: () => number = Date.now) {
    this.#startedAt = now();
  }

  markRunning(): void {
    this.#runningAt ??= this.now();
  }

  observe(event: AgentSessionEvent): void {
    if (event.type === "turn_start") {
      this.#toolsThisTurn = 0;
      return;
    }
    if (event.type === "tool_execution_start") {
      this.#toolStarts.set(event.toolCallId, {
        toolName: timingToolName(event.toolName, event.args),
        startedAt: this.now(),
      });
      this.#toolsThisTurn++;
      this.#maxConcurrentTools = Math.max(this.#maxConcurrentTools, this.#toolStarts.size);
      this.#maxToolsPerTurn = Math.max(this.#maxToolsPerTurn, this.#toolsThisTurn);
      return;
    }
    if (event.type !== "tool_execution_end") return;

    const start = this.#toolStarts.get(event.toolCallId);
    this.#toolStarts.delete(event.toolCallId);
    const toolName = start?.toolName ?? event.toolName;
    const durationMs = start ? Math.max(0, this.now() - start.startedAt) : 0;
    const timing = this.#tools.get(toolName) ?? {
      count: 0,
      errorCount: 0,
      totalMs: 0,
      maxMs: 0,
    };
    timing.count++;
    if (event.isError) timing.errorCount++;
    timing.totalMs += durationMs;
    timing.maxMs = Math.max(timing.maxMs, durationMs);
    this.#tools.set(toolName, timing);
  }

  snapshot(): AgentRunTiming {
    const finishedAt = this.now();
    return {
      elapsedMs: Math.max(0, finishedAt - this.#startedAt),
      ...(this.#runningAt === undefined
        ? {}
        : { setupMs: Math.max(0, this.#runningAt - this.#startedAt) }),
      incompleteToolCount: this.#toolStarts.size,
      maxConcurrentTools: this.#maxConcurrentTools,
      maxToolsPerTurn: this.#maxToolsPerTurn,
      tools: [...this.#tools]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([toolName, timing]) => ({ toolName, ...timing })),
    };
  }
}

function timingToolName(toolName: string, args: unknown): string {
  if (toolName !== "code_find" || !args || typeof args !== "object") return toolName;
  const mode = (args as { mode?: unknown }).mode;
  return mode === "ast" || mode === "semantic" ? `${toolName}:${mode}` : toolName;
}

/** Return the public status for one Agent Run outcome. */
export function statusFromOutcome(outcome: AgentRunOutcome<string>): AgentRunStatus {
  return outcome.kind === "success" ? "completed" : outcome.kind;
}

/** Return the stable failure code for one non-success outcome. */
export function failureCodeFromOutcome(outcome: AgentRunOutcome<string>): string | undefined {
  if (outcome.kind === "failed") return outcome.failureCode;
  if (outcome.kind === "canceled" || outcome.kind === "timeout") return outcome.kind;
  return undefined;
}

/** Record one safe summary for a completed Agent Run. */
export function recordAgentRunOutcomeDebug(
  input: {
    cwd: string;
    taskId: string;
    profileId: string;
    modelId: string;
    thinkingLevel: ModelThinkingLevel;
    turns: number;
    toolUses: number;
    timing: AgentRunTiming;
  },
  outcome: AgentRunOutcome<string>,
): void {
  const status = statusFromOutcome(outcome);
  const usage = outcome.usage;
  recordDebugEvent({
    source: "supi-agent",
    level: status === "completed" || status === "canceled" ? "info" : "warning",
    category: "agent-run",
    message: `Agent Run ${input.taskId} ${status}`,
    cwd: input.cwd,
    data: {
      taskId: input.taskId,
      profileId: input.profileId,
      modelId: input.modelId,
      thinkingLevel: input.thinkingLevel,
      status,
      turns: input.turns,
      toolUses: input.toolUses,
      timing: input.timing,
      ...(usage
        ? {
            usage: {
              input: usage.input,
              output: usage.output,
              cacheRead: usage.cacheRead,
              cacheWrite: usage.cacheWrite,
              reasoning: usage.reasoning,
              total: usage.totalTokens,
            },
          }
        : {}),
      failureCode: failureCodeFromOutcome(outcome),
      ...(outcome.kind === "timeout" ? { timeoutMs: outcome.timeoutMs } : {}),
      ...(outcome.kind === "success" ||
      (outcome.kind === "failed" && outcome.failureCode === "session-creation-failed")
        ? {}
        : { diagnostics: outcome.diagnostics }),
    },
  });
}
