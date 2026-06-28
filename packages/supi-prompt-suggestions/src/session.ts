/**
 * Session lifecycle management for supi-prompt-suggestions.
 *
 * Owns the ghost editor wrapper, status spinner, and suggestion generator
 * orchestration across the session lifecycle.
 *
 * @module
 */

import type { AgentEndEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StatusSpinner } from "@mrclrchtr/supi-core/api";
import { type GhostTextCallbacks, GhostTextEditor } from "./editor/editor.ts";
import type { GenerationStatus, SuggestionGenerator } from "./generation/generator.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/** Narrow shape for session message entries used in history seeding. */
interface SessionMessageEntry {
  type: "message";
  message?: { role?: string; content?: { type: string; text?: string }[] };
}

// ── SessionLifecycle ───────────────────────────────────────────────────────

/**
 * Manages the prompt-suggestions extension lifecycle across session events.
 *
 * Owns the ghost editor, status spinner, and wires suggestion generation
 * results to the UI.  Instances are created once per extension load and
 * reused across session restarts.
 */
export class SessionLifecycle {
  private ghostEditor: GhostTextEditor | null = null;
  private statusSpinner: StatusSpinner | null = null;

  constructor(private generator: SuggestionGenerator) {}

  // ── Session events ──────────────────────────────────────────────

  /** Install the ghost editor wrapper, seed UP-arrow history, and recreate the spinner. */
  onStart(ctx: ExtensionContext): void {
    this.statusSpinner?.stop();
    this.statusSpinner = new StatusSpinner(ctx, "supi-prompt-suggestions");
    this.installEditor(ctx);
  }

  /** Extract the last assistant message and fire suggestion generation. */
  onAgentEnd(event: AgentEndEvent, ctx: ExtensionContext): void {
    const lastAssistant = extractLastAssistantText(event);
    if (!lastAssistant) {
      this.statusSpinner?.stop();
      return;
    }

    this.generator.start(ctx, lastAssistant, {
      onStatus: (status: GenerationStatus) => this.handleStatus(status, ctx),
    });
  }

  /** Dismiss in-flight generation, stop spinner, clear ghost text. */
  onAgentStart(): void {
    this.statusSpinner?.stop();
    this.generator.dismiss();
    this.ghostEditor?.clearGhost();
  }

  /** Full cleanup on session shutdown. */
  onShutdown(): void {
    this.statusSpinner?.stop();
    this.generator.dismiss();
    this.ghostEditor?.clearGhost();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private handleStatus(status: GenerationStatus, ctx: ExtensionContext): void {
    switch (status.kind) {
      case "generating":
        this.statusSpinner?.start("generating suggestion…");
        break;
      case "ready":
        this.statusSpinner?.stop();
        if (ctx.ui.getEditorText() === "") {
          this.ghostEditor?.setSuggestion(status.suggestion);
        }
        break;
      case "error":
        this.statusSpinner?.stop();
        ctx.ui.setStatus("supi-prompt-suggestions", `suggestion error: ${status.message}`);
        break;
      case "idle":
        this.statusSpinner?.stop();
        break;
    }
  }

  private buildCallbacks(): GhostTextCallbacks {
    return {
      onAccept: (_suggestion: string) => {
        this.generator.dismiss();
        this.ghostEditor?.clearGhost();
      },
      onDismiss: () => {
        this.statusSpinner?.stop();
        this.generator.dismiss();
        this.ghostEditor?.clearGhost();
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
  private seedHistoryFromSession(editor: GhostTextEditor, ctx: ExtensionContext): void {
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

  private installEditor(ctx: ExtensionContext): void {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new GhostTextEditor(tui, theme, keybindings, {
        callbacks: this.buildCallbacks(),
      });
      this.ghostEditor = editor;
      this.seedHistoryFromSession(editor, ctx);
      return editor;
    });
  }
}

// ── Free helpers ───────────────────────────────────────────────────────────

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
