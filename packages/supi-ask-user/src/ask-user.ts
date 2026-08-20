import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  notifyToolPromptSurfaceDiagnostics,
  resolveToolPromptSurface,
} from "@mrclrchtr/supi-core/prompt-surface";
import { createSessionNameTracker } from "@mrclrchtr/supi-core/session";
import { formatTitle, signalWaiting } from "@mrclrchtr/supi-core/terminal";
import { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
import { renderAskUserCall, renderAskUserResult } from "./render/transcript.ts";
import { type AskUserParams, AskUserParamsSchema } from "./schema.ts";
import { ActiveQuestionnaireLock } from "./session/lock.ts";
import {
  ASK_USER_PROMPT_SURFACE_DEFAULTS,
  ASK_USER_TOOL_LABEL,
  ASK_USER_TOOL_NAME,
} from "./tool/guidance.ts";
import { type AskUserToolResult, buildResult } from "./tool/result.ts";
import type {
  AskUserInteractionResult,
  AskUserOutcome,
  AskUserToolDetails,
  NormalizedQuestionnaire,
} from "./types.ts";
import { runQuestionnaire } from "./ui/choose-renderer.ts";
import type { EditorFactory } from "./ui/types.ts";

export type AskUserExecutionContext = Pick<ExtensionContext, "cwd" | "hasUI" | "mode" | "abort"> & {
  ui: {
    custom?: unknown;
    notify?(message: string, type?: "info" | "warning" | "error"): void;
    setWorkingVisible?(visible: boolean): void;
    setTitle?(title: string): void;
    getToolsExpanded?(): boolean;
    setToolsExpanded?(expanded: boolean): void;
    getEditorComponent?(): EditorFactory | undefined;
  };
};

export default function askUserExtension(pi: ExtensionAPI): void {
  const lock = new ActiveQuestionnaireLock();
  const getSessionName = createSessionNameTracker(pi);

  // Label ask_user tool results so they're visible and filterable in /tree.
  // Use a non-awaited setTimeout: the agent awaits our handler's return before
  // it appends the tool result to the session, so we must let the handler resolve
  // first and label from a deferred callback.
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== ASK_USER_TOOL_NAME) return;
    const toolCallId = event.toolCallId;
    setTimeout(() => {
      const entries = ctx.sessionManager.getEntries();
      const entry = [...entries]
        .reverse()
        .find(
          (e) =>
            e.type === "message" &&
            e.message.role === "toolResult" &&
            e.message.toolCallId === toolCallId,
        );
      if (entry) {
        pi.setLabel(entry.id, "decision");
      }
    }, 0);
  });

  // Factory-time: register with package defaults.
  registerAskUserTool(pi, lock, ASK_USER_PROMPT_SURFACE_DEFAULTS, getSessionName);

  // session_start: re-register with resolved prompt surface (global + trusted project config).
  pi.on("session_start", async (_event, ctx) => {
    const { surface, diagnostics } = resolveToolPromptSurface({
      section: "ask-user",
      toolName: ASK_USER_TOOL_NAME,
      defaults: ASK_USER_PROMPT_SURFACE_DEFAULTS,
      ctx,
    });

    registerAskUserTool(pi, lock, surface, getSessionName);
    notifyToolPromptSurfaceDiagnostics(ctx, diagnostics);
  });
}

function registerAskUserTool(
  pi: ExtensionAPI,
  lock: ActiveQuestionnaireLock,
  surface: typeof ASK_USER_PROMPT_SURFACE_DEFAULTS,
  getSessionName: () => string | undefined,
): void {
  pi.registerTool<typeof AskUserParamsSchema, AskUserToolDetails>({
    name: ASK_USER_TOOL_NAME,
    label: ASK_USER_TOOL_LABEL,
    description: surface.description,
    promptSnippet: surface.promptSnippet,
    promptGuidelines: surface.promptGuidelines,
    parameters: AskUserParamsSchema,
    executionMode: "sequential",
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeAskUser(params, signal, ctx, lock, pi, getSessionName());
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
  sessionName?: string,
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
        getEditorComponent: ctx.ui.getEditorComponent
          ? () => ctx.ui.getEditorComponent?.()
          : undefined,
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

    pi.appendEntry("ask_user", {
      title: questionnaire.title,
      questions: questionnaire.questions.length,
    });
    return buildResult(questionnaire, outcome);
  } finally {
    ctx.ui.setWorkingVisible?.(true);
    pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" });
    restoreTerminalTitle(ctx, sessionName);
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

function restoreTerminalTitle(ctx: AskUserExecutionContext, sessionName: string | undefined): void {
  ctx.ui.setTitle?.(formatTitle(sessionName, ctx.cwd));
}

function asFunction<T extends (...args: never[]) => unknown>(value: unknown): T | undefined {
  return typeof value === "function" ? (value as T) : undefined;
}

export { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
export { AskUserController } from "./session/controller.ts";
export {
  promptGuidelines as askUserPromptGuidelines,
  promptSnippet as askUserPromptSnippet,
} from "./tool/guidance.ts";
