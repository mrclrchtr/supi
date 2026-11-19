/**
 * supi-prompt-suggestions PI extension entrypoint.
 *
 * Registers settings and wires session event handlers to a
 * {@link SessionLifecycle} instance that owns the ghost editor,
 * status spinner, and suggestion generator lifecycle.
 *
 * @module
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SIDE_RUN_END_EVENT, SIDE_RUN_START_EVENT } from "@mrclrchtr/supi-core/session";
import { registerPromptSuggestionsSettings } from "./config/settings.ts";
import { SuggestionGenerator } from "./generation/generator.ts";
import { SessionLifecycle } from "./session.ts";

export default function (pi: ExtensionAPI): void {
  const generator = new SuggestionGenerator();
  const session = new SessionLifecycle(generator);

  registerPromptSuggestionsSettings(pi, () => session.onSettingsChanged());

  pi.on("session_start", (_event, ctx) => session.onStart(ctx));
  pi.on("agent_settled", (_event, ctx) => session.onAgentSettled(ctx));
  pi.on("agent_start", () => session.onAgentStart());
  pi.on("session_tree", (_event, ctx) => session.onTreeNavigated(ctx));
  pi.on("session_shutdown", () => session.onShutdown());
  pi.events.on(SIDE_RUN_START_EVENT, () => session.onSideRunStart());
  pi.events.on(SIDE_RUN_END_EVENT, () => session.onSideRunEnd());
}
