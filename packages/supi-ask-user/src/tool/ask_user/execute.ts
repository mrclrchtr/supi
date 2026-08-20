import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTitle, signalWaiting } from "@mrclrchtr/supi-core/terminal";
import { AskUserValidationError, normalizeQuestionnaire } from "../../normalize.ts";
import type { AskUserParams } from "../../schema.ts";
import type { ActiveQuestionnaireLock } from "../../session/lock.ts";
import type {
  AskUserInteractionResult,
  AskUserOutcome,
  NormalizedQuestionnaire,
} from "../../types.ts";
import { runQuestionnaire } from "../../ui/choose-renderer.ts";
import type { EditorFactory } from "../../ui/types.ts";
import { type AskUserToolResult, buildResult } from "./result.ts";

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
