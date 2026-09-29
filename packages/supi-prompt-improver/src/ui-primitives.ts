import type {
  ExtensionUIContext,
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  Editor,
  type EditorTheme,
  type Focusable,
  type TUI,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

type EditorFactory = NonNullable<ReturnType<ExtensionUIContext["getEditorComponent"]>>;

export interface EditorComponent extends Component, Focusable {
  getText(): string;
  getExpandedText?(): string;
  setText(text: string): void;
  handleInput(data: string): void;
  onSubmit?: (value: string) => void;
  onChange?: (value: string) => void;
  dispose?(): void;
}

export function createEditor(options: {
  tui: TUI;
  theme: Theme;
  keybindings: KeybindingsManager;
  factory: EditorFactory | undefined;
  notify: ExtensionUIContext["notify"];
}): EditorComponent {
  const { tui, theme, keybindings, factory, notify } = options;
  const editorTheme: EditorTheme = {
    borderColor: (text) => theme.fg("accent", text),
    selectList: {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    },
  };
  if (factory) {
    try {
      const candidate: unknown = factory(tui, editorTheme, keybindings);
      if (isEditorComponent(candidate)) return candidate;
      throw new Error("The custom editor does not support prompt input.");
    } catch (error) {
      notify?.(
        error instanceof Error ? error.message : "The custom editor could not open.",
        "warning",
      );
    }
  }
  return new Editor(tui, editorTheme) as EditorComponent;
}

function isEditorComponent(value: unknown): value is EditorComponent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["render", "invalidate", "getText", "setText", "handleInput"].every(
    (method) => typeof candidate[method] === "function",
  );
}

export function frame(title: string, body: string[], width: number, theme: Theme): string[] {
  const safeWidth = Math.max(1, width);
  if (safeWidth < 8) return [title, ...body].map((line) => truncateToWidth(line, safeWidth));
  const innerWidth = safeWidth - 4;
  const border = theme.fg("borderAccent", "│");
  const top = theme.fg("borderAccent", `╭${"─".repeat(safeWidth - 2)}╮`);
  const bottom = theme.fg("borderAccent", `╰${"─".repeat(safeWidth - 2)}╯`);
  const rows = [title, ...body].map((line) => {
    const truncated = truncateToWidth(line, innerWidth);
    const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
    return `${border} ${truncated}${padding} ${border}`;
  });
  return [top, ...rows, bottom].map((line) => truncateToWidth(line, safeWidth));
}
