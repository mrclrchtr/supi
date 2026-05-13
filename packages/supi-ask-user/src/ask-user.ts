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

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { formatTitle, signalWaiting } from "@mrclrchtr/supi-core";
import { ActiveQuestionnaireLock } from "./flow.ts";
import { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
import { renderAskUserCall, renderAskUserResult } from "./render.ts";
import { buildErrorResult, buildResult, type HybridResult } from "./result.ts";
import { type AskUserParams, AskUserParamsSchema } from "./schema.ts";
import type { NormalizedQuestionnaire } from "./types.ts";
import { type RichUiHost, runRichQuestionnaire } from "./ui/ui-rich.ts";

const TOOL_NAME = "ask_user";
const TOOL_LABEL = "Ask User";

const TOOL_DESCRIPTION =
  "Ask the user a focused decision question (or up to 4 grouped questions) when explicit user input is required to proceed safely. Use for clarifying intent, picking between options, prioritizing a short set of features, or confirming a destructive action — not for surveys or open-ended discovery. Questions are `choice` (with options; set `multi: true` for multi-select) or `text` (freeform input). Structured questions can add `recommendation`, `default`, `allowOther`, `allowDiscuss`, and option `preview` content.";

const PROMPT_SNIPPET =
  "ask_user — pause and request a focused decision (1-4 typed questions) when explicit user input is required to proceed, including rich choice and discuss flows";

const PROMPT_GUIDELINES = [
  "Use ask_user only for decisions that require explicit user input — never as a substitute for reading code or thinking through a problem.",
  "Keep questionnaires bounded: 1-4 focused questions with short headers; prefer one decision per call when possible.",
  'There are two question types: `choice` for picking from options (single-select by default; set `multi: true` for multi-select — use this instead of the now-removed `multichoice`) and `text` for freeform input. For yes/no questions, use `choice` with options `{value: "yes", label: "Yes"}` and `{value: "no", label: "No"}`.',
  "Set `recommendation` when one option or a small set of options is clearly preferable, so the UI can surface that guidance.",
  "Set `default` to pre-select a starting value or option; the user can accept it with a single keystroke. Use it for safe/common defaults, distinct from `recommendation` which highlights what you think is best.",
  "Enable `allowOther` only when a custom answer is genuinely useful, and `allowDiscuss` only when the user may need to talk through the choice instead of deciding immediately.",
  "Use `description` to explain what each option means — it wraps naturally and a few sentences is fine. Reserve `preview` for code, config, or diagrams that need dedicated rendering space in a side pane.",
  "Do not call ask_user while another ask_user interaction is in flight — wait for the previous result before issuing another.",
];

/** Minimal ui subset needed by executeAskUser — extended with setTitle/notify from ExtensionUIContext. */
interface ExtensionUi {
  ui: {
    custom?: RichUiHost["custom"];
    setWorkingVisible?(visible: boolean): void;
    /** Set the terminal window/tab title. */
    setTitle?(title: string): void;
    /** Show a notification to the user. */
    notify?(message: string, type?: "info" | "warning" | "error"): void;
  };
  /**
   * Absolute path to the current working directory, available on the full
   * ExtensionContext. Marked optional here to tolerate partial mocks.
   */
  cwd?: string;
  hasUI: boolean;
  abort(): void;
}

export default function askUserExtension(pi: ExtensionAPI): void {
  const lock = new ActiveQuestionnaireLock();

  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: TOOL_DESCRIPTION,
    promptSnippet: PROMPT_SNIPPET,
    promptGuidelines: PROMPT_GUIDELINES,
    parameters: AskUserParamsSchema,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeAskUser(
        params as AskUserParams,
        signal,
        ctx as unknown as ExtensionUi,
        lock,
        pi,
      );
    },
    renderCall: (args, theme) => renderAskUserCall(args, theme as Theme),
    renderResult: (result, _options, theme) =>
      renderAskUserResult(
        result as { details?: unknown; content: { type: string; text?: string }[] },
        theme as Theme,
      ) as unknown as Component,
  });
}

// biome-ignore lint/complexity/useMaxParams: pi context + pi reference for appendEntry
async function executeAskUser(
  params: AskUserParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionUi,
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
    restoreTerminalTitle(ctx, pi);
    lock.release();
  }
}

/** Set terminal title and play alert bell to signal the user needs to respond. */
function signalAttention(ctx: ExtensionUi): void {
  signalWaiting(ctx, `pi — waiting for your input`);
}

/** Restore the terminal title to pi's native format (session name + cwd). */
function restoreTerminalTitle(ctx: ExtensionUi, pi: ExtensionAPI): void {
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
  ctx: ExtensionUi,
): Promise<HybridResult> {
  const questions = questionnaire.questions;
  if (typeof ctx.ui.custom !== "function") {
    return buildErrorResult(
      "Error: ask_user requires a TUI with custom overlay support. Do not use ask_user in non-interactive or degraded UI sessions.",
    );
  }
  const richHost: RichUiHost = { custom: ctx.ui.custom.bind(ctx.ui) };
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
export { PROMPT_GUIDELINES as askUserPromptGuidelines, PROMPT_SNIPPET as askUserPromptSnippet };
