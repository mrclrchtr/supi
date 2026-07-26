import {
  type AgentSession,
  type AgentSessionEvent,
  defineTool,
} from "@earendil-works/pi-coding-agent";
import type {
  ChildFailureDiagnostics,
  RawReviewResult,
  ReviewInvocation,
  ReviewOutputEvent,
  ReviewProgress,
} from "../types.ts";
import type { ChildLifecycleHostMarker } from "./child-lifecycle-trace.ts";
import { buildProgressTokens } from "./runner-helpers.ts";
import { reviewOutputSchema } from "./schemas.ts";

const STEER_SUBMIT_MESSAGE =
  "You stopped without calling submit_review. Call submit_review now with your findings.";
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Runner-specific context combining lifecycle-managed fields with
// runner-private mutable state.
// ---------------------------------------------------------------------------
export interface RunnerContext {
  progress: ReviewProgress;
  session: AgentSession;
  resolve: (result: RawReviewResult) => void;
  cleanup: (result: RawReviewResult) => RawReviewResult;
  state: { settled: boolean; aborting: boolean };
  resultHolder: { value: ReviewOutputEvent | undefined };
  invocation: ReviewInvocation;
  submitSteered: boolean;
  timeoutSteered: boolean;
  graceTurnsRemaining: number | undefined;
  getFailureDiagnostics: () => ChildFailureDiagnostics;
  recordHostMarker: (marker: ChildLifecycleHostMarker) => void;
  /** Accumulated per-tool-label execution counts. */
  toolCounts: Record<string, number>;
  /** Set of distinct file paths inspected via read_snapshot_diff / read_snapshot_file. */
  inspectedFiles: Set<string>;
  /** Timestamp (ms) when the runner started, for elapsed-time display. */
  startTime: number;
}

// ---------------------------------------------------------------------------
// Tool and progress helpers
// ---------------------------------------------------------------------------

/** Maps tool names to compact display labels for the progress line. */
function toolNameToLabel(name: string): string {
  const map: Record<string, string> = {
    read: "reads",
    grep: "greps",
    find: "finds",
    ls: "ls",
    submit_review: "submits",
    read_snapshot_diff: "diffs",
    read_snapshot_file: "file-reads",
  };
  return map[name] ?? name;
}

/** Maps tool names to focus labels for the progress narrative line. */
function toolNameToFocusLabel(name: string): string {
  const map: Record<string, string> = {
    read: "Reading",
    grep: "Searching",
    find: "Finding",
    ls: "Listing",
    submit_review: "Submitting review",
    read_snapshot_diff: "Reading",
    read_snapshot_file: "Reading",
  };
  return map[name] ?? name;
}

/** Extract the basename from a file path, or return the path unchanged. */
function extractBasename(file: string): string {
  const lastSlash = file.lastIndexOf("/");
  return lastSlash >= 0 ? file.slice(lastSlash + 1) : file;
}

/** Truncate a focus detail string to a display-friendly length. */
function truncateFocusDetail(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

/** Extract focus detail from a read-type tool (read, read_snapshot_diff, read_snapshot_file). */
function tryExtractReadDetail(toolName: string, a: Record<string, unknown>): string | undefined {
  const file = (a.file ?? a.path) as string | undefined;
  if (!file) return undefined;
  const name = extractBasename(file);
  if (toolName === "read_snapshot_diff") return `${name} (diff)`;
  if (toolName === "read_snapshot_file") return `${name} (full)`;
  return name;
}

/** Extract a human-readable detail string from tool args for the focus display. */
function tryExtractFocusDetail(toolName: string, args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const a = args as Record<string, unknown>;

  // submit_review is self-explanatory — no detail needed
  if (toolName === "submit_review") return undefined;

  // Read-type tools: extract file path, show basename only
  if (
    toolName === "read" ||
    toolName === "read_snapshot_diff" ||
    toolName === "read_snapshot_file"
  ) {
    return tryExtractReadDetail(toolName, a);
  }

  // grep: show the search pattern
  if (toolName === "grep") {
    const pattern = a.pattern as string | undefined;
    return pattern ? truncateFocusDetail(pattern) : undefined;
  }

  // find: show the glob / pattern
  if (toolName === "find") {
    const pattern = (a.pattern ?? a.glob) as string | undefined;
    return pattern ? truncateFocusDetail(pattern) : undefined;
  }

  // ls: show the listing path
  if (toolName === "ls") {
    const path = a.path as string | undefined;
    return path ? truncateFocusDetail(path) : undefined;
  }

  return undefined;
}

/** Extract a file path from tool args when the tool is file-inspecting (for inspectedFiles tracking). */
function tryExtractFileArg(toolName: string, args: unknown): string | undefined {
  if (toolName !== "read_snapshot_diff" && toolName !== "read_snapshot_file") return undefined;
  if (typeof args !== "object" || args === null) return undefined;
  const file = (args as Record<string, unknown>).file;
  return typeof file === "string" ? file : undefined;
}

export function createSubmitReviewTool(resultHolder: {
  value: ReviewOutputEvent | undefined;
}): ReturnType<typeof defineTool> {
  return defineTool({
    name: "submit_review",
    label: "Submit Review",
    description:
      "Submit the final structured review result after you finish investigating the changes.",
    parameters: reviewOutputSchema,
    execute: async (_toolCallId, args) => {
      resultHolder.value = args as ReviewOutputEvent;
      return {
        content: [{ type: "text" as const, text: "Review submitted successfully." }],
        details: args,
        terminate: true,
      };
    },
  });
}

export function emitProgress(ctx: RunnerContext): void {
  ctx.progress.tokens = buildProgressTokens(() => ctx.session.getSessionStats());
  ctx.progress.toolCounts = { ...ctx.toolCounts };
  ctx.progress.filesInspected = ctx.inspectedFiles.size;
  ctx.progress.filesTotal = ctx.invocation.snapshot.stats.files;
  ctx.progress.elapsedMs = Date.now() - ctx.startTime;
  ctx.invocation.onProgress?.(ctx.progress);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

export function handleTurnEnd(ctx: RunnerContext): void {
  ctx.progress.turns++;

  if (!ctx.state.settled && ctx.timeoutSteered && ctx.graceTurnsRemaining !== undefined) {
    ctx.graceTurnsRemaining--;
    if (ctx.graceTurnsRemaining <= 0) {
      ctx.state.aborting = true;
      doFinalAbort(ctx);
    }
  }

  emitProgress(ctx);
}

export function handleToolStart(
  event: Extract<AgentSessionEvent, { type: "tool_execution_start" }>,
  ctx: RunnerContext,
): void {
  ctx.progress.toolUses++;

  const label = toolNameToLabel(event.toolName);
  ctx.toolCounts[label] = (ctx.toolCounts[label] ?? 0) + 1;

  const file = tryExtractFileArg(event.toolName, event.args);
  if (file) ctx.inspectedFiles.add(file);

  const focusDetail = tryExtractFocusDetail(event.toolName, event.args);
  ctx.progress.currentFocus = {
    label: toolNameToFocusLabel(event.toolName),
    detail: focusDetail ?? "",
  };

  ctx.invocation.onToolActivity?.({ toolName: event.toolName, phase: "start" });
  emitProgress(ctx);
}

export function handleToolEnd(
  event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>,
  ctx: RunnerContext,
): void {
  ctx.progress.currentFocus = undefined;
  ctx.invocation.onToolActivity?.({ toolName: event.toolName, phase: "end" });
  emitProgress(ctx);
}

export function handleMessageEnd(
  event: Extract<AgentSessionEvent, { type: "message_end" }>,
  ctx: RunnerContext,
): void {
  if (ctx.state.settled || ctx.submitSteered || ctx.resultHolder.value) return;

  const msg = event.message as { role?: string; stopReason?: string };
  if (msg.role !== "assistant" || msg.stopReason !== "stop") return;

  ctx.submitSteered = true;
  ctx.recordHostMarker({ type: "steer_requested", reason: "submit" });
  ctx.session.steer(STEER_SUBMIT_MESSAGE).catch(() => {});
}

/**
 * Finalize only after Pi has no retry, compaction recovery, or queued continuation left.
 * `agent_end` is a low-level boundary and is not terminal for a managed session.
 */
export function handleAgentSettled(ctx: RunnerContext): void {
  if (ctx.state.settled || ctx.state.aborting) return;

  if (ctx.resultHolder.value) {
    ctx.resolve(
      ctx.cleanup({
        kind: "success",
        output: ctx.resultHolder.value,
        snapshot: ctx.invocation.snapshot,
        brief: ctx.invocation.brief,
        modelId: ctx.invocation.model.canonicalId,
      }),
    );
    return;
  }

  ctx.resolve(
    ctx.cleanup({
      kind: "failed",
      failureCode: "missing-structured-output",
      snapshot: ctx.invocation.snapshot,
      brief: ctx.invocation.brief,
      modelId: ctx.invocation.model.canonicalId,
      diagnostics: ctx.getFailureDiagnostics(),
    }),
  );
}

export function handleSessionEvent(event: AgentSessionEvent, ctx: RunnerContext): void {
  switch (event.type) {
    case "turn_end":
      handleTurnEnd(ctx);
      break;
    case "tool_execution_start":
      handleToolStart(event, ctx);
      break;
    case "tool_execution_end":
      handleToolEnd(event, ctx);
      break;
    case "message_end": {
      handleMessageEnd(event, ctx);
      break;
    }
    case "agent_settled":
      handleAgentSettled(ctx);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Hard-abort helper (called from handleTurnEnd when grace turns expire)
// ---------------------------------------------------------------------------

function doFinalAbort(ctx: RunnerContext): void {
  emitProgress(ctx);
  ctx.recordHostMarker({ type: "abort_requested", reason: "timeout" });
  void ctx.session
    .abort()
    .catch(() => {})
    .finally(() => {
      ctx.resolve(
        ctx.cleanup({
          kind: "timeout" as const,
          snapshot: ctx.invocation.snapshot,
          timeoutMs: ctx.invocation.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          brief: ctx.invocation.brief,
          modelId: ctx.invocation.model.canonicalId,
          diagnostics: ctx.getFailureDiagnostics(),
        }),
      );
    });
}
