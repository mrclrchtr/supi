import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AskUserParamsSchema } from "../../schema.ts";
import type { ActiveQuestionnaireLock } from "../../session/lock.ts";
import type { AskUserToolDetails } from "../../types.ts";
import { executeAskUser } from "./execute.ts";
import type { ASK_USER_PROMPT_SURFACE_DEFAULTS } from "./guidance.ts";
import { renderAskUserCall, renderAskUserResult } from "./render.ts";
import { askUserSpec } from "./spec.ts";

/** Shape of the configurable ask_user prompt surface. */
export type AskUserPromptSurface = typeof ASK_USER_PROMPT_SURFACE_DEFAULTS;

/** Register ask_user with one resolved prompt surface. */
export function registerAskUserTool(
  pi: ExtensionAPI,
  lock: ActiveQuestionnaireLock,
  surface: AskUserPromptSurface,
  getSessionName: () => string | undefined,
): void {
  pi.registerTool<typeof AskUserParamsSchema, AskUserToolDetails>({
    ...askUserSpec,
    description: surface.description,
    promptSnippet: surface.promptSnippet,
    promptGuidelines: surface.promptGuidelines,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return executeAskUser(params, signal, ctx, lock, pi, getSessionName());
    },
    renderCall: (args, theme) => renderAskUserCall(args, theme),
    renderResult: (result, options, theme, context) =>
      renderAskUserResult(result, theme, options, context),
  });
}
