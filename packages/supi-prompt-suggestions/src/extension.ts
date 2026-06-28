/**
 * supi-prompt-suggestions PI extension entrypoint.
 *
 * Registers settings, listens for agent_end to generate suggestions,
 * and manages the ghost-text editor wrapper lifecycle.
 *
 * @module
 */

import type {
  AgentEndEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { registerPromptSuggestionsSettings } from "./config/settings.ts";
import { type GhostTextCallbacks, GhostTextEditor } from "./editor/editor.ts";
import { SuggestionGenerator } from "./generation/generator.ts";
import { StatusSpinner } from "./ui/status-spinner.ts";

export default function (pi: ExtensionAPI): void {
  let ghostEditor: GhostTextEditor | null = null;
  let statusSpinner: StatusSpinner | null = null;
  const generator = new SuggestionGenerator();

  // ── Settings ─────────────────────────────────────────────

  registerPromptSuggestionsSettings();

  // ── Helpers ──────────────────────────────────────────────

  function buildCallbacks(_ctx: ExtensionContext): GhostTextCallbacks {
    return {
      onAccept: (_suggestion: string) => {
        generator.dismiss();
        clearGhost();
      },
      onDismiss: () => {
        statusSpinner?.stop();
        generator.dismiss();
        clearGhost();
      },
    };
  }

  /**
   * Seed the editor's UP-arrow message history from session user messages.
   *
   * The Editor base class stores history in-memory via `addToHistory()` when
   * messages are submitted.  Since `setEditorComponent` replaces the editor
   * with a fresh instance on every `session_start` (including `/reload`), the
   * in-memory history is lost.  Reading from `sessionManager.getEntries()`
   * repopulates it from the persistent session file so history survives reloads.
   *
   * Cross-module save/restore (capturing the old editor's history in
   * `session_shutdown` and restoring in `session_start`) does not work here
   * because `/reload` creates fresh module instances — the old module's
   * closure variables are destroyed before the new module can read them.
   */
  /** Narrow shape for session message entries used in history seeding. */
  interface SessionMessageEntry {
    type: "message";
    message?: { role?: string; content?: { type: string; text?: string }[] };
  }

  function seedHistoryFromSession(editor: GhostTextEditor, ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getEntries();
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const msg = (entry as SessionMessageEntry).message;
      if (msg?.role !== "user") continue;
      const text = msg.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
        .trim();
      if (text) editor.addToHistory(text);
    }
  }

  function installEditor(ctx: ExtensionContext): void {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new GhostTextEditor(tui, theme, keybindings, {
        callbacks: buildCallbacks(ctx),
      });
      ghostEditor = editor;

      // Seed history from session so UP-arrow navigation works across reloads
      seedHistoryFromSession(editor, ctx);

      return editor;
    });
  }

  function clearGhost(): void {
    ghostEditor?.clearGhost();
  }

  function setGhostSuggestion(suggestion: string): void {
    ghostEditor?.setSuggestion(suggestion);
  }

  // ── Editor installation ──────────────────────────────────

  pi.on("session_start", (_event, ctx: ExtensionContext) => {
    // Recreate spinner with fresh session context
    statusSpinner?.stop();
    statusSpinner = new StatusSpinner(ctx, "supi-prompt-suggestions");
    installEditor(ctx);
  });

  // ── Agent end → generate suggestion ──────────────────────

  pi.on("agent_end", (event: AgentEndEvent, ctx: ExtensionContext) => {
    const lastAssistant = extractLastAssistantText(event);
    if (!lastAssistant) {
      statusSpinner?.stop();
      return;
    }

    generator.start(ctx, lastAssistant, {
      onStatus: (status) => {
        switch (status.kind) {
          case "generating":
            statusSpinner?.start("generating suggestion…");
            break;
          case "ready":
            statusSpinner?.stop();
            if (ctx.ui.getEditorText() === "") {
              setGhostSuggestion(status.suggestion);
            }
            break;
          case "error":
            statusSpinner?.stop();
            ctx.ui.setStatus("supi-prompt-suggestions", `suggestion error: ${status.message}`);
            break;
          case "idle":
            statusSpinner?.stop();
            break;
        }
      },
    });
  });

  // ── Agent start → clear ghost text ───────────────────────

  pi.on("agent_start", (_event, _ctx: ExtensionContext) => {
    statusSpinner?.stop();
    generator.dismiss();
    clearGhost();
  });

  // ── Session shutdown → cleanup ───────────────────────────

  pi.on("session_shutdown", () => {
    statusSpinner?.stop();
    generator.dismiss();
    clearGhost();
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractLastAssistantText(event: AgentEndEvent): string | null {
  const messages = event.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant") {
      const textContent = msg.content
        ?.filter((c: { type: string; text?: string }) => c.type === "text")
        .map((c: { type: string; text?: string }) => c.text)
        .join("")
        .trim();
      return textContent || null;
    }
  }
  return null;
}
