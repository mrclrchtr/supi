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
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GhostTextCallbacks {
  onAccept: (suggestion: string) => void;
  onDismiss: () => void;
}

export interface GhostTextEditorOptions extends EditorOptions {
  callbacks: GhostTextCallbacks;
}

// ── Component ──────────────────────────────────────────────────────────────

export class GhostTextEditor extends CustomEditor {
  private suggestion: string | null = null;
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
    this.tui.requestRender();
  }

  clearGhost(): void {
    this.suggestion = null;
    this.tui.requestRender();
  }

  // ── Input handling ──────────────────────────────────────────

  override handleInput(data: string): void {
    if (this.suggestion) {
      // Use PI's matchesKey (not raw escape sequences) — it handles
      // CSI (\x1b[C), SS3 (\x1bOC), and Kitty keyboard protocol correctly.
      if (matchesKey(data, "right")) {
        this.insertTextAtCursor(this.suggestion);
        this.callbacks.onAccept(this.suggestion);
        this.clearGhost();
        return;
      }
      this.clearGhost();
      this.callbacks.onDismiss();
    }
    super.handleInput(data);
  }

  // ── Rendering ───────────────────────────────────────────────

  override render(width: number): string[] {
    const lines = super.render(width);
    if (!this.suggestion || !this.focused) return lines;

    const markerIndex = findCursorMarkerLine(lines);
    if (markerIndex === -1) return lines;

    const markerLine = lines[markerIndex];
    if (!markerLine) return lines;

    // Cap ghost text to at most half the terminal width.
    const cursorPos = markerLine.indexOf(CURSOR_MARKER);
    const available = width - visibleWidth(markerLine.slice(0, cursorPos));
    const maxGhost = Math.min(available - 1, Math.floor(width / 2));
    if (maxGhost <= 0) return lines;
    const plainSuggestion = truncateToWidth(this.suggestion, maxGhost, "");
    if (!plainSuggestion) return lines;
    const ghost = `\x1b[2m${plainSuggestion}\x1b[0m`;
    const gw = visibleWidth(plainSuggestion);

    // Shrink the line first so ghost addition stays within terminal width.
    const shrunk = truncateToWidth(markerLine, width - gw, "");
    if (!shrunk.includes(CURSOR_MARKER)) return lines;

    const insertPos = ghostInsertPosition(shrunk);

    lines[markerIndex] = shrunk.slice(0, insertPos) + ghost + shrunk.slice(insertPos);
    return lines;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find the character position where ghost text should be inserted on
 * a line containing {@link CURSOR_MARKER}.
 *
 * The ghost text is inserted after the visual cursor block emitted by
 * `CustomEditor`.  Since the cursor is rendered as an inverse-video span
 * bounded by `\x1b[7m` … `\x1b[0m`, we search for the reset escape after
 * the cursor marker to skip the entire block.
 *
 * @remarks
 * This depends on `CustomEditor`'s internal ANSI encoding of the cursor.
 * If the upstream cursor rendering changes, this helper must be updated.
 */
function ghostInsertPosition(line: string): number {
  const cursorIdx = line.indexOf(CURSOR_MARKER);
  if (cursorIdx === -1) return 0;

  const afterMarker = line.slice(cursorIdx + CURSOR_MARKER.length);
  const inverseEnd = afterMarker.indexOf("\x1b[0m");
  return cursorIdx + CURSOR_MARKER.length + (inverseEnd >= 0 ? inverseEnd + 4 : 0);
}

function findCursorMarkerLine(lines: string[]): number {
  return lines.findIndex((l) => l.includes(CURSOR_MARKER));
}
