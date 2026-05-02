// Editor pane rendering helpers for the rich overlay.

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Editor } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { OverlayRenderState } from "./ui-rich-render-types.ts";

export function editorCaption(state: OverlayRenderState): string {
  if (state.subMode === "other-input") return "Other answer";
  if (state.subMode === "discuss-input") return "Discuss";
  if (state.subMode === "note-input") return "Note";
  return "Answer";
}

export function usesSeparateEditorPane(state: OverlayRenderState): boolean {
  return state.subMode === "note-input";
}

export function renderEditorPane(
  width: number,
  theme: Theme,
  editor: Editor,
  caption: string,
): string[] {
  const out: string[] = [];
  out.push(truncateToWidth(theme.fg("accent", ` ${caption}`), width));
  out.push("");
  for (const line of editor.render(width - 2)) out.push(truncateToWidth(` ${line}`, width));
  return out;
}

// biome-ignore lint/complexity/useMaxParams: helper mirrors render context
export function renderEditorBlock(
  add: (text: string) => void,
  lines: string[],
  theme: Theme,
  editor: Editor,
  width: number,
  caption: string,
): void {
  add(theme.fg("muted", ` ${caption}:`));
  for (const line of editor.render(width - 2)) lines.push(` ${truncateToWidth(line, width - 1)}`);
}

export function padRight(text: string, width: number): string {
  const visible = truncateToWidth(text, width);
  const padding = Math.max(0, width - visibleWidth(visible));
  return `${visible}${" ".repeat(padding)}`;
}
