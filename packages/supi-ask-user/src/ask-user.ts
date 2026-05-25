import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTitle, signalWaiting } from "@mrclrchtr/supi-core/terminal";
import { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
import { type AskUserToolResult, buildErrorResult, buildResult } from "./render/result.ts";
import { renderAskUserCall, renderAskUserResult } from "./render/transcript.ts";
import { buildTreeSummaryLabel } from "./render/tree-summary.ts";
import { type AskUserParams, AskUserParamsSchema } from "./schema.ts";
import { ActiveQuestionnaireLock } from "./session/lock.ts";
import { promptGuidelines, promptSnippet, toolDescription } from "./tool/guidance.ts";
import type { AskUserToolDetails, NormalizedQuestionnaire } from "./types.ts";
import { runQuestionnaire } from "./ui/choose-renderer.ts";

const TOOL_NAME = "ask_user";
const TOOL_LABEL = "Ask User";

export type AskUserExecutionContext = Pick<ExtensionContext, "cwd" | "hasUI" | "abort"> & {
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
      return buildErrorResult(`Error: ${error.message}`);
    }
    throw error;
  }

  if (!ctx.hasUI) {
    return buildErrorResult(
      "Error: ask_user requires an interactive UI session. No user-facing UI is available in the current mode.",
    );
  }
  if (!lock.acquire()) {
    return buildErrorResult(
      "Error: another ask_user form is already in flight. Wait for it to complete before calling ask_user again.",
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
      return buildErrorResult(
        "Error: ask_user requires a TUI with custom overlay support. Do not use ask_user in non-interactive or degraded UI sessions.",
      );
    }

    if (outcome.status === "cancelled" || outcome.status === "aborted") {
      ctx.abort();
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
export { buildErrorResult, buildResult } from "./render/result.ts";
export { AskUserController } from "./session/controller.ts";
export { ActiveQuestionnaireLock } from "./session/lock.ts";
export {
  promptGuidelines as askUserPromptGuidelines,
  promptSnippet as askUserPromptSnippet,
} from "./tool/guidance.ts";
