import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTitle, signalWaiting } from "@mrclrchtr/supi-core/terminal";
import { openAskUserForm } from "../../form-api.ts";
import { AskUserValidationError, normalizeQuestionnaire } from "../../normalize.ts";
import type { AskUserParams } from "../../schema.ts";
import type {
  AskUserInteractionResult,
  AskUserOutcome,
  NormalizedQuestionnaire,
} from "../../types.ts";
import { type AskUserToolResult, buildResult } from "./result.ts";

export type AskUserExecutionContext = Pick<ExtensionContext, "cwd" | "hasUI" | "mode" | "abort"> & {
  ui: Pick<
    ExtensionContext["ui"],
    | "custom"
    | "notify"
    | "setWorkingVisible"
    | "setTitle"
    | "getToolsExpanded"
    | "setToolsExpanded"
    | "getEditorComponent"
  >;
};

// biome-ignore lint/complexity/useMaxParams: keep the execution boundary explicit for tests
export async function executeAskUser(
  params: AskUserParams,
  signal: AbortSignal | undefined,
  ctx: AskUserExecutionContext,
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
  const getToolsExpanded = ctx.ui.getToolsExpanded as (() => boolean) | undefined;
  const setToolsExpanded = ctx.ui.setToolsExpanded as ((expanded: boolean) => void) | undefined;
  const onToggleToolsExpanded =
    getToolsExpanded && setToolsExpanded
      ? () => ctx.ui.setToolsExpanded?.(!ctx.ui.getToolsExpanded?.())
      : undefined;
  const outcome = await openAskUserForm(questionnaire, {
    ui: ctx.ui,
    signal,
    onToggleToolsExpanded,
    onAcquire: () => {
      signalAttention(ctx);
      pi.events.emit("supi:ask-user:start", { source: "supi-ask-user" });
      ctx.ui.setWorkingVisible?.(false);
    },
    onRelease: () => {
      ctx.ui.setWorkingVisible?.(true);
      pi.events.emit("supi:ask-user:end", { source: "supi-ask-user" });
      restoreTerminalTitle(ctx, sessionName);
    },
  });

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
}

function isInternalInteractionResult(
  outcome: AskUserOutcome | AskUserInteractionResult,
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
