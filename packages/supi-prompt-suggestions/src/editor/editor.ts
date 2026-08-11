/**
 * Ghost-text editor component.
 *
 * Extends PI's CustomEditor and renders prompt suggestions as dim ghost text
 * after the cursor in an empty editor.
 *
 * @module
 */

import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type EditorOptions,
  type EditorTheme,
  matchesKey,
  type TUI,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GhostTextCallbacks {
  onAccept: (suggestion: string) => void;
  onDismiss: () => void;
  onInput?: () => void;
}

export interface GhostTextEditorOptions extends EditorOptions {
  callbacks: GhostTextCallbacks;
}

// ── Component ──────────────────────────────────────────────────────────────

export class GhostTextEditor extends CustomEditor {
  private suggestion: string | null = null;
  private isSuppressed = false;
  private callbacks: GhostTextCallbacks;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    options: GhostTextEditorOptions,
  ) {
    const { callbacks, ...editorOptions } = options;
    super(tui, theme, keybindings, editorOptions);
    this.callbacks = callbacks;
  }

  // ── Ghost text API ──────────────────────────────────────────

  setSuggestion(suggestion: string | null): void {
    this.suggestion = suggestion;
    this.isSuppressed = suggestion !== null && this.getText() !== "";
    this.tui.requestRender();
  }

  clearGhost(): void {
    this.suggestion = null;
    this.isSuppressed = false;
    this.tui.requestRender();
  }

  // ── Input handling ──────────────────────────────────────────

  override handleInput(data: string): void {
    if (this.suggestion && !this.isSuppressed) {
      // Use PI's matchesKey (not raw escape sequences) — it handles
      // CSI (\x1b[C), SS3 (\x1bOC), and Kitty keyboard protocol correctly.
      if (matchesKey(data, "right") || matchesKey(data, "tab")) {
        this.insertTextAtCursor(this.suggestion);
        this.callbacks.onAccept(this.suggestion);
        this.clearGhost();
        return;
      }
      if (matchesKey(data, "escape")) {
        this.clearGhost();
        this.callbacks.onDismiss();
        return;
      }
    } else if (!this.suggestion) {
      this.callbacks.onInput?.();
    }

    super.handleInput(data);
    this.syncSuppression();
  }

  override setText(text: string): void {
    super.setText(text);
    this.syncSuppression();
  }

  override insertTextAtCursor(text: string): void {
    super.insertTextAtCursor(text);
    this.syncSuppression();
  }

  private syncSuppression(): void {
    if (!this.suggestion) return;

    const isSuppressed = this.getText() !== "";
    if (isSuppressed === this.isSuppressed) return;

    this.isSuppressed = isSuppressed;
    this.tui.requestRender();
  }

  // ── Rendering ───────────────────────────────────────────────

  override render(width: number): string[] {
    const lines = super.render(width);
    if (!this.suggestion || this.isSuppressed || !this.focused) return lines;

    const markerIndex = findCursorMarkerLine(lines);
    if (markerIndex === -1) return lines;

    const markerLine = lines[markerIndex];
    if (!markerLine) return lines;

    const ghost = `\x1b[2m${this.suggestion}\x1b[0m`;
    const wrapped = wrapTextWithAnsi(`${markerLine.trimEnd()}${ghost}`, width);
    lines.splice(markerIndex, 1, ...wrapped);
    return lines;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function findCursorMarkerLine(lines: string[]): number {
  return lines.findIndex((line) => line.includes(CURSOR_MARKER));
}
