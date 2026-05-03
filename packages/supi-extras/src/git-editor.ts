import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Prevent git from opening an interactive editor in headless agent contexts.
 *
 * Sets `GIT_EDITOR` and `GIT_SEQUENCE_EDITOR` in the process environment so
 * every git subprocess spawned by pi (bash tool calls, `!`/`!!` user commands,
 * scripts) runs `true` instead of blocking on an editor that will never appear.
 */
export default function gitEditor(pi: ExtensionAPI) {
  // Set unconditionally; pi runs headless and any editor invocation hangs.
  process.env.GIT_EDITOR = "true";
  process.env.GIT_SEQUENCE_EDITOR = "true";
}
