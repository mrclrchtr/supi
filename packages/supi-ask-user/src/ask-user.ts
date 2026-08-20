import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  notifyToolPromptSurfaceDiagnostics,
  resolveToolPromptSurface,
} from "@mrclrchtr/supi-core/prompt-surface";
import { createSessionNameTracker } from "@mrclrchtr/supi-core/session";
import { ActiveQuestionnaireLock } from "./session/lock.ts";
import { ASK_USER_PROMPT_SURFACE_DEFAULTS } from "./tool/ask_user/guidance.ts";
import { registerAskUserTool } from "./tool/ask_user/register.ts";
import { ASK_USER_TOOL_NAME } from "./tool/ask_user/spec.ts";

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

export { AskUserValidationError, normalizeQuestionnaire } from "./normalize.ts";
export { AskUserController } from "./session/controller.ts";
export { type AskUserExecutionContext, executeAskUser } from "./tool/ask_user/execute.ts";
export {
  promptGuidelines as askUserPromptGuidelines,
  promptSnippet as askUserPromptSnippet,
} from "./tool/ask_user/guidance.ts";
