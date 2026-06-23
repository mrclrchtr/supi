import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTitle, signalWaiting } from "@mrclrchtr/supi-core/terminal";
import { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
import { type AskUserToolResult, buildResult } from "./render/result.ts";
import { renderAskUserCall, renderAskUserResult } from "./render/transcript.ts";
import { buildTreeSummaryLabel } from "./render/tree-summary.ts";
import { type AskUserParams, AskUserParamsSchema } from "./schema.ts";
import { ActiveQuestionnaireLock } from "./session/lock.ts";
import {
  ASK_USER_TOOL_LABEL,
  ASK_USER_TOOL_NAME,
  promptGuidelines,
  promptSnippet,
  toolDescription,
} from "./tool/guidance.ts";
import type {
  AskUserInteractionResult,
  AskUserOutcome,
  AskUserToolDetails,
  NormalizedQuestionnaire,
} from "./types.ts";
import { runQuestionnaire } from "./ui/choose-renderer.ts";

export type AskUserExecutionContext = Pick<ExtensionContext, "cwd" | "hasUI" | "mode" | "abort"> & {
  ui: {
    custom?: unknown;
    notify?(message: string, type?: "info" | "warning" | "error"): void;
    setWorkingVisible?(visible: boolean): void;
    setTitle?(title: string): void;
    getToolsExpanded?(): boolean;
    setToolsExpanded?(expanded: boolean): void;
  };
};

export default function askUserExtension(pi: ExtensionAPI): void {
  const lock = new ActiveQuestionnaireLock();

  pi.registerTool<typeof AskUserParamsSchema, AskUserToolDetails>({
    name: ASK_USER_TOOL_NAME,
    label: ASK_USER_TOOL_LABEL,
    description: toolDescription,
    promptSnippet,
    promptGuidelines,
    parameters: AskUserParamsSchema,
    executionMode: "sequential",
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeAskUser(params, signal, ctx, lock, pi);
    },
    renderCall: (args, theme) => renderAskUserCall(args, theme),
    renderResult: (result, options, theme, context) =>
      renderAskUserResult(result, theme, options, context),
  });
}

// biome-ignore lint/complexity/useMaxParams: keep the execution boundary explicit for tests
export async function executeAskUser(
  params: AskUserParams,
  signal: AbortSignal | undefined,
  ctx: AskUserExecutionContext,
  lock: ActiveQuestionnaireLock,
  pi: ExtensionAPI,
): Promise<AskUserToolResult> {
  let questionnaire: NormalizedQuestionnaire;
  try {
    questionnaire = normalizeQuestionnaire(params);
  } catch (error) {
    if (error instanceof AskUserValidationError) {
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }

  if (!ctx.hasUI || ctx.mode !== "tui") {
    throw new Error(
      "ask_user requires an interactive TUI session. No user-facing form UI is available in the current mode.",
    );
  }
  if (!lock.acquire()) {
    throw new Error(
      "another ask_user form is already in flight. Wait for it to complete before calling ask_user again.",
    );
  }

  signalAttention(ctx);
  pi.events.emit("supi:ask-user:start", { source: "supi-ask-user" });

  try {
    ctx.ui.setWorkingVisible?.(false);
    const outcome = await runQuestionnaire(questionnaire, {
      ui: {
        custom: asFunction(ctx.ui.custom),
        notify: ctx.ui.notify,
      },
      signal,
      onToggleToolsExpanded:
        ctx.ui.getToolsExpanded && ctx.ui.setToolsExpanded
          ? () => ctx.ui.setToolsExpanded?.(!ctx.ui.getToolsExpanded?.())
          : undefined,
    });

    if (outcome === "unsupported") {
      throw new Error(
        "ask_user requires a TUI with custom form support. Do not use ask_user in non-interactive or degraded UI sessions.",
      );
    }

    // Internal cancel/abort: treat as control flow, abort the turn, and mark the tool failed.
    if (isInternalInteractionResult(outcome)) {
      ctx.abort();
      throw new Error("The user interaction was cancelled.");
    }

    pi.appendEntry(buildTreeSummaryLabel(questionnaire));
    return buildResult(questionnaire, outcome);
  } finally {
    ctx.ui.setWorkingVisible?.(true);
    pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" });
    restoreTerminalTitle(ctx, pi);
    lock.release();
  }
}

function isInternalInteractionResult(
  outcome: AskUserOutcome | AskUserInteractionResult | "unsupported",
): outcome is AskUserInteractionResult {
  return (
    typeof outcome === "object" &&
    "kind" in outcome &&
    (outcome.kind === "cancel" || outcome.kind === "abort")
  );
}

function signalAttention(ctx: AskUserExecutionContext): void {
  signalWaiting(ctx, "pi — waiting for your input");
}

function restoreTerminalTitle(ctx: AskUserExecutionContext, pi: ExtensionAPI): void {
  ctx.ui.setTitle?.(formatTitle(pi.getSessionName(), ctx.cwd));
}

function asFunction<T extends (...args: never[]) => unknown>(value: unknown): T | undefined {
  return typeof value === "function" ? (value as T) : undefined;
}

export { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
export { AskUserController } from "./session/controller.ts";
export { ActiveQuestionnaireLock } from "./session/lock.ts";
export {
  promptGuidelines as askUserPromptGuidelines,
  promptSnippet as askUserPromptSnippet,
} from "./tool/guidance.ts";
