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

type SessionTextContent = string | { type: string; text?: string }[] | undefined;

/** Narrow shape for session message entries used in history seeding. */
interface SessionMessageEntry {
  type: "message";
  message?: {
    role?: string;
    stopReason?: string;
    content?: SessionTextContent;
  };
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
  private generationInFlight = false;

  constructor(private generator: SuggestionGenerator) {}

  // ── Session events ──────────────────────────────────────────────

  /** Install the ghost editor wrapper, seed UP-arrow history, and recreate the spinner. */
  onStart(ctx: ExtensionContext): void {
    this.statusSpinner?.stop();
    this.statusSpinner = null;
    this.ghostEditor = null;
    if (ctx.mode !== "tui") return;

    this.statusSpinner = new StatusSpinner(ctx, "supi-prompt-suggestions");
    this.installEditor(ctx);
  }

  /** Extract the last assistant message and fire suggestion generation. */
  onAgentEnd(event: AgentEndEvent, ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;

    const lastAssistant = extractLastAssistantText(event);
    if (!lastAssistant) {
      this.statusSpinner?.stop();
      this.generationInFlight = false;
      return;
    }

    if (ctx.ui.getEditorText() !== "") {
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
    this.generationInFlight = false;
    this.generator.dismiss();
    this.ghostEditor?.clearGhost();
  }

  /** Full cleanup on session shutdown. */
  onShutdown(): void {
    this.statusSpinner?.stop();
    this.generationInFlight = false;
    this.generator.dismiss();
    this.ghostEditor?.clearGhost();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private handleStatus(status: GenerationStatus, ctx: ExtensionContext): void {
    switch (status.kind) {
      case "generating":
        this.generationInFlight = true;
        this.statusSpinner?.start("generating suggestion…");
        break;
      case "ready":
        this.generationInFlight = false;
        this.statusSpinner?.stop();
        if (ctx.ui.getEditorText() === "") {
          this.ghostEditor?.setSuggestion(status.suggestion);
        }
        break;
      case "error":
        this.generationInFlight = false;
        this.statusSpinner?.stop();
        break;
      case "idle":
        this.generationInFlight = false;
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
        this.generationInFlight = false;
        this.generator.dismiss();
        this.ghostEditor?.clearGhost();
      },
      onInput: () => this.abortPendingGeneration(),
    };
  }

  private abortPendingGeneration(): void {
    if (!this.generationInFlight) return;
    this.statusSpinner?.stop();
    this.generationInFlight = false;
    this.generator.dismiss();
  }

  /**
   * Seed the editor's UP-arrow message history from session user messages.
   *
   * The Editor base class stores history in-memory via `addToHistory()` when
   * messages are submitted.  Since `setEditorComponent` replaces the editor
   * with a fresh instance on every `session_start` (including `/reload`), the
   * in-memory history is lost.  Reading from `sessionManager.getBranch()`
   * repopulates it from the current conversation path so history survives
   * reloads without pulling prompts from abandoned branches.
   *
   * Cross-module save/restore (capturing the old editor's history in
   * `session_shutdown` and restoring in `session_start`) does not work here
   * because `/reload` creates fresh module instances — the old module's
   * closure variables are destroyed before the new module can read them.
   */
  private seedHistoryFromSession(editor: GhostTextEditor, ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getBranch();
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const msg = (entry as SessionMessageEntry).message;
      if (msg?.role !== "user") continue;
      const text = extractTextContent(msg.content).trim();
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
      if (msg.stopReason !== "stop") return null;
      const textContent = extractTextContent(msg.content).trim();
      return textContent || null;
    }
  }
  return null;
}

function extractTextContent(content: SessionTextContent): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}
