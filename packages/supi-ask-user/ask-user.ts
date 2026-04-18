// `ask_user` extension entry point. Registers a single model-callable tool
// for focused interactive decisions during an agent run. Holds the per-session
// single-active-questionnaire lock and chooses between the rich overlay and
// the dialog fallback at execute time.
//
// Implementation modules:
//   schema.ts           — external (LLM-facing) parameter schema
//   normalize.ts        — validation + normalization into the shared internal model
//   flow.ts             — shared questionnaire flow + concurrency lock
//   ui-rich.ts          — overlay UI via ctx.ui.custom()
//   ui-rich-render.ts   — overlay rendering helpers
//   ui-fallback.ts      — dialog/input fallback adapter
//   result.ts           — hybrid (content + details) result formatting
//   render.ts           — custom renderCall / renderResult for the transcript

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { ActiveQuestionnaireLock } from "./flow.ts";
import { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
import { renderAskUserCall, renderAskUserResult } from "./render.ts";
import { buildErrorResult, buildResult, type HybridResult } from "./result.ts";
import { type AskUserParams, AskUserParamsSchema } from "./schema.ts";
import type { NormalizedQuestion } from "./types.ts";
import { type FallbackUi, runFallbackQuestionnaire } from "./ui-fallback.ts";
import { type RichUiHost, runRichQuestionnaire } from "./ui-rich.ts";

const TOOL_NAME = "ask_user";
const TOOL_LABEL = "Ask User";

const TOOL_DESCRIPTION =
  "Ask the user a focused decision question (or up to 4 grouped questions) when explicit user input is required to proceed safely. Use for clarifying intent, picking between options, prioritizing a short set of features, or confirming a destructive action — not for surveys or open-ended discovery. Each question is `choice`, `multichoice`, `text`, or `yesno`; structured questions can add `recommendation`, `allowOther`, `allowDiscuss`, and option `preview` content.";

const PROMPT_SNIPPET =
  "ask_user — pause and request a focused decision (1-4 typed questions) when explicit user input is required to proceed, including rich choice, multichoice, and discuss flows";

const PROMPT_GUIDELINES = [
  "Use ask_user only for decisions that require explicit user input — never as a substitute for reading code or thinking through a problem.",
  "Keep questionnaires bounded: 1-4 focused questions with short headers; prefer one decision per call when possible.",
  "Choose the narrowest type that fits: yesno for binary decisions, choice for one known option, multichoice for short pick-many lists, and text only when freeform input is genuinely needed.",
  "Set `recommendation` when one option or a small set of options is clearly preferable, so the UI can surface that guidance.",
  "Enable `allowOther` only when a custom answer is genuinely useful, and `allowDiscuss` only when the user may need to talk through the choice instead of deciding immediately.",
  "Use option `preview` content when the user would understand choices better from code, config, markdown, or ASCII mockups than from one-line descriptions alone.",
  "Do not call ask_user while another ask_user interaction is in flight — wait for the previous result before issuing another.",
];

interface ExtensionUi {
  ui: {
    select: FallbackUi["select"];
    input: FallbackUi["input"];
    custom?: RichUiHost["custom"];
  };
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
      return executeAskUser(params as AskUserParams, signal, ctx as unknown as ExtensionUi, lock);
    },
    renderCall: (args, theme) => renderAskUserCall(args, theme as Theme),
    renderResult: (result, _options, theme) =>
      renderAskUserResult(
        result as { details?: unknown; content: { type: string; text?: string }[] },
        theme as Theme,
      ) as unknown as Component,
  });
}

async function executeAskUser(
  params: AskUserParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionUi,
  lock: ActiveQuestionnaireLock,
): Promise<HybridResult> {
  let normalized: NormalizedQuestion[];
  try {
    normalized = normalizeQuestionnaire(params).questions;
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
  try {
    const result = await driveQuestionnaire(normalized, signal, ctx);
    if (result.details.terminalState !== "submitted") {
      ctx.abort();
    }
    return result;
  } finally {
    lock.release();
  }
}

async function driveQuestionnaire(
  questions: NormalizedQuestion[],
  signal: AbortSignal | undefined,
  ctx: ExtensionUi,
): Promise<HybridResult> {
  if (typeof ctx.ui.custom === "function") {
    const richHost: RichUiHost = { custom: ctx.ui.custom.bind(ctx.ui) };
    const outcome = await runRichQuestionnaire(questions, { ui: richHost, signal });
    if (outcome !== "unsupported") return buildResult(questions, outcome);
  }
  const fallbackUi: FallbackUi = {
    select: ctx.ui.select.bind(ctx.ui),
    input: ctx.ui.input.bind(ctx.ui),
  };
  const outcome = await runFallbackQuestionnaire(questions, { ui: fallbackUi, signal });
  return buildResult(questions, outcome);
}

export { ActiveQuestionnaireLock, QuestionnaireFlow } from "./flow.ts";
// Re-exports used by tests.
export { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
export { buildResult } from "./result.ts";
export { runFallbackQuestionnaire } from "./ui-fallback.ts";
export { PROMPT_GUIDELINES as askUserPromptGuidelines, PROMPT_SNIPPET as askUserPromptSnippet };
