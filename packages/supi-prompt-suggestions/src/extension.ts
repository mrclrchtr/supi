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
import { registerPromptSuggestionsSettings } from "./config/settings.ts";
import { SuggestionGenerator } from "./generation/generator.ts";
import { SessionLifecycle } from "./session.ts";

export default function (pi: ExtensionAPI): void {
  registerPromptSuggestionsSettings();

  const generator = new SuggestionGenerator();
  const session = new SessionLifecycle(generator);

  pi.on("session_start", (_event, ctx) => session.onStart(ctx));
  pi.on("agent_end", (event, ctx) => session.onAgentEnd(event, ctx));
  pi.on("agent_start", () => session.onAgentStart());
  pi.on("session_shutdown", () => session.onShutdown());
}
