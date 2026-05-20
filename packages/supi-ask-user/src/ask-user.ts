// `ask_user` extension entry point. Registers a single model-callable tool
// for focused interactive decisions during an agent run. Holds the per-session
// single-active-questionnaire lock and drives the rich overlay UI.
//
// Implementation modules:
//   schema.ts           — external (LLM-facing) parameter schema
//   normalize.ts        — validation + normalization into the shared internal model
//   flow.ts             — shared questionnaire flow + concurrency lock
//   ui-rich.ts          — overlay UI via ctx.ui.custom()
//   ui-rich-render.ts   — overlay rendering helpers
//   result.ts           — hybrid (content + details) result formatting
//   render.ts           — custom renderCall / renderResult for the transcript

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTitle, signalWaiting } from "@mrclrchtr/supi-core/api";
import { ActiveQuestionnaireLock } from "./flow.ts";
import { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
import { renderAskUserCall, renderAskUserResult } from "./render.ts";
import { buildErrorResult, buildResult, type HybridResult } from "./result.ts";
import { type AskUserParams, AskUserParamsSchema } from "./schema.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./tool/guidance.ts";
import type { AskUserDetails, NormalizedQuestionnaire } from "./types.ts";
import { type RichUiHost, runRichQuestionnaire } from "./ui/ui-rich.ts";

const TOOL_NAME = "ask_user";
const TOOL_LABEL = "Ask User";

type AskUserExecutionContext = Pick<ExtensionContext, "cwd" | "hasUI" | "abort"> & {
  ui: {
    custom?: unknown;
    setWorkingVisible?(visible: boolean): void;
    setTitle?(title: string): void;
    notify?(message: string, type?: "info" | "warning" | "error"): void;
  };
};

export default function askUserExtension(pi: ExtensionAPI): void {
  const lock = new ActiveQuestionnaireLock();

  pi.registerTool<typeof AskUserParamsSchema, AskUserDetails>({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    parameters: AskUserParamsSchema,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeAskUser(params, signal, ctx, lock, pi);
    },
    renderCall: (args, theme) => renderAskUserCall(args, theme),
    renderResult: (result, _options, theme) => renderAskUserResult(result, theme),
  });
}

// biome-ignore lint/complexity/useMaxParams: pi context + pi reference for appendEntry
async function executeAskUser(
  params: AskUserParams,
  signal: AbortSignal | undefined,
  ctx: AskUserExecutionContext,
  lock: ActiveQuestionnaireLock,
  pi: ExtensionAPI,
): Promise<HybridResult> {
  let normalized: NormalizedQuestionnaire;
  try {
    normalized = normalizeQuestionnaire(params);
  } catch (err) {
    if (err instanceof AskUserValidationError) return buildErrorResult(`Error: ${err.message}`);
    throw err;
  }
  if (!ctx.hasUI) {
    return buildErrorResult(
      "Error: ask_user requires interactive UI but the current session has none.",
    );
  }
  if (!lock.acquire()) {
    return buildErrorResult(
      "Error: another ask_user interaction is already in flight. Wait for it to complete before calling ask_user again.",
    );
  }
  signalAttention(ctx);
  pi.events.emit("supi:ask-user:start", { source: "supi-ask-user" });
  try {
    // Hide the built-in working loader so it doesn't compete with the overlay.
    ctx.ui.setWorkingVisible?.(false);
    const result = await driveQuestionnaire(normalized, signal, ctx);
    if (
      result.details.terminalState !== "submitted" &&
      result.details.terminalState !== "skipped"
    ) {
      ctx.abort();
    }
    // Append a tree-friendly custom entry so /tree shows a readable
    // summary (question headers) instead of raw JSON tool-call arguments.
    // Custom entries are hidden in the default tree filter, visible in
    // "all" mode (Ctrl+O).
    pi.appendEntry(treeSummaryLabel(normalized));
    return result;
  } finally {
    // Restore the working loader regardless of how the overlay closed.
    ctx.ui.setWorkingVisible?.(true);
    pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" });
    restoreTerminalTitle(ctx, pi);
    lock.release();
  }
}

/** Set terminal title and play alert bell to signal the user needs to respond. */
function signalAttention(ctx: AskUserExecutionContext): void {
  signalWaiting(ctx, `pi — waiting for your input`);
}

/** Restore the terminal title to pi's native format (session name + cwd). */
function restoreTerminalTitle(ctx: AskUserExecutionContext, pi: ExtensionAPI): void {
  ctx.ui.setTitle?.(formatTitle(pi.getSessionName(), ctx.cwd));
}

/** Build a concise custom-entry label readable in the /tree "all" filter. */
function treeSummaryLabel(q: NormalizedQuestionnaire): string {
  const count = q.questions.length;
  const s = count === 1 ? "" : "s";
  const headers = q.questions.map((q) => q.header).join(", ");
  if (headers.length > 70) {
    return `ask_user · ${count} question${s} · ${headers.slice(0, 67)}...`;
  }
  return `ask_user · ${count} question${s} · ${headers}`;
}

async function driveQuestionnaire(
  questionnaire: NormalizedQuestionnaire,
  signal: AbortSignal | undefined,
  ctx: AskUserExecutionContext,
): Promise<HybridResult> {
  const questions = questionnaire.questions;
  if (typeof ctx.ui.custom !== "function") {
    return buildErrorResult(
      "Error: ask_user requires a TUI with custom overlay support. Do not use ask_user in non-interactive or degraded UI sessions.",
    );
  }
  const richHost: RichUiHost = { custom: ctx.ui.custom as RichUiHost["custom"] };
  const outcome = await runRichQuestionnaire(questionnaire, { ui: richHost, signal });
  if (outcome === "unsupported") {
    return buildErrorResult(
      "Error: ask_user requires a TUI with custom overlay support. Do not use ask_user in non-interactive or degraded UI sessions.",
    );
  }
  return buildResult(questions, outcome);
}

export { ActiveQuestionnaireLock, QuestionnaireFlow } from "./flow.ts";
// Re-exports used by tests.
export { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
export { buildResult } from "./result.ts";
export {
  promptGuidelines as askUserPromptGuidelines,
  promptSnippet as askUserPromptSnippet,
} from "./tool/guidance.ts";
