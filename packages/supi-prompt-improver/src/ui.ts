import type {
  ExtensionUIContext,
  KeybindingsManager,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  CURSOR_MARKER,
  type Focusable,
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { createEditor, type EditorComponent, frame } from "./ui-primitives.ts";

export type ImproverUi = Pick<
  ExtensionUIContext,
  "custom" | "getEditorComponent" | "getEditorText" | "setEditorText" | "notify"
>;

export type DraftInputResult = { kind: "confirmed"; text: string } | { kind: "cancelled" };
export type RequestWaitResult<T> =
  | { kind: "complete"; value: T }
  | { kind: "cancelled" }
  | { kind: "failed"; error: unknown };

/** Open a temporary local editor. It does not change the main editor. */
export function openDraftInput(
  ui: ImproverUi,
  prefill: string,
  signal: AbortSignal,
  modelId: string,
): Promise<DraftInputResult> {
  return ui.custom<DraftInputResult>(
    (tui, theme, keybindings, done) =>
      new DraftInputScreen({ tui, theme, keybindings, ui, prefill, signal, modelId, done }),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "92%", maxHeight: "85%", margin: 1 },
    },
  );
}

/** Show a wait screen that closes as soon as the user or caller cancels. */
export async function waitForRequest<T>(
  ui: ImproverUi,
  options: {
    signal: AbortSignal;
    cancel: () => void;
    label: string;
    request: Promise<T>;
  },
): Promise<RequestWaitResult<T>> {
  const receiver = new RequestResultReceiver<T>();
  const requestDelivery = options.request.then(receiver.onFulfilled, receiver.onRejected);
  void requestDelivery.catch(ignoreRequestDeliveryError);

  if (options.signal.aborted) {
    receiver.detach();
    try {
      options.cancel();
    } catch {
      // The wait is already cancelled.
    }
    return { kind: "cancelled" };
  }

  let screen: RequestScreen<T> | undefined;
  try {
    return await ui.custom<RequestWaitResult<T>>(
      (tui, theme, _keybindings, done) => {
        screen = new RequestScreen<T>({
          tui,
          theme,
          signal: options.signal,
          cancel: options.cancel,
          done,
          label: options.label,
          receiver,
        });
        return screen;
      },
      {
        overlay: true,
        overlayOptions: { anchor: "center", width: 58, maxHeight: 8, margin: 1 },
      },
    );
  } catch (error) {
    if (screen) screen.dispose();
    else {
      receiver.detach();
      try {
        options.cancel();
      } catch {
        // Keep the UI error as the reported error.
      }
    }
    receiver.detach();
    throw error;
  }
}

/** Provider callbacks retain this receiver only; detach drops the screen and its callbacks. */
class RequestResultReceiver<T> {
  readonly onFulfilled = (value: T): void => this.deliver({ kind: "complete", value });
  readonly onRejected = (error: unknown): void => this.deliver({ kind: "failed", error });
  private screen: RequestScreen<T> | undefined;
  private pending: RequestWaitResult<T> | undefined;
  private detached = false;

  attach(screen: RequestScreen<T>): boolean {
    if (this.detached) return false;
    this.screen = screen;
    const pending = this.pending;
    this.pending = undefined;
    if (pending) screen.finish(pending);
    return true;
  }

  deliver(result: RequestWaitResult<T>): void {
    if (this.detached) return;
    if (this.screen) this.screen.finish(result);
    else this.pending = result;
  }

  detach(screen?: RequestScreen<T>): void {
    if (screen && this.screen !== screen) return;
    this.detached = true;
    this.screen = undefined;
    this.pending = undefined;
  }
}

function ignoreRequestDeliveryError(): void {}

class DraftInputScreen implements Component, Focusable {
  focused = false;
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly keybindings: KeybindingsManager;
  private readonly signal: AbortSignal;
  private readonly modelId: string;
  private readonly done: (result: DraftInputResult) => void;
  private readonly editor: EditorComponent;
  private lines: string[] | undefined;
  private cachedWidth: number | undefined;
  private cachedRows: number | undefined;
  private closed = false;
  private readonly onAbort: () => void;

  constructor(options: {
    tui: TUI;
    theme: Theme;
    keybindings: KeybindingsManager;
    ui: ImproverUi;
    prefill: string;
    signal: AbortSignal;
    modelId: string;
    done: (result: DraftInputResult) => void;
  }) {
    const { tui, theme, keybindings, ui, prefill, signal, modelId, done } = options;
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.signal = signal;
    this.modelId = modelId;
    this.done = done;
    this.editor = createEditor({
      tui,
      theme,
      keybindings,
      factory: ui.getEditorComponent?.(),
      notify: ui.notify,
    });
    this.editor.setText(prefill);
    this.editor.onSubmit = () => undefined;
    this.editor.onChange = () => this.refresh();
    this.onAbort = () => this.finish({ kind: "cancelled" });
    if (signal.aborted) this.onAbort();
    else signal.addEventListener("abort", this.onAbort, { once: true });
  }

  render(width: number): string[] {
    if (this.editor.focused !== this.focused) this.editor.focused = this.focused;
    const safeWidth = Math.max(1, width);
    const rows = Math.max(1, this.tui.terminal.rows ?? 24);
    if (this.lines && this.cachedWidth === safeWidth && this.cachedRows === rows) return this.lines;
    this.cachedWidth = safeWidth;
    this.cachedRows = rows;

    const overlayRows = overlayMaxRows(this.tui, 85);
    const compact = overlayRows < 12 || safeWidth < 40;
    const borderRows = compact ? 0 : 2;
    const innerWidth = compact ? safeWidth : Math.max(1, safeWidth - 4);
    const privacyText = `On confirmation, the draft and selected context go to ${this.modelId}.`;
    const privacy = compact
      ? [truncateToWidth(privacyText, innerWidth)]
      : wrapTextWithAnsi(privacyText, innerWidth).slice(0, 2);
    const title = this.theme.fg("accent", "Improve a request draft");
    const help = truncateToWidth(
      this.theme.fg("dim", "Enter confirms · Shift+Enter adds a line · Esc cancels"),
      innerWidth,
    );
    const header = [title, ...privacy.map((line) => this.theme.fg("dim", line))];
    const maxHeaderRows = Math.max(1, overlayRows - borderRows - 2);
    const visibleHeader = header.slice(0, maxHeaderRows);
    const bodyRows = Math.max(1, overlayRows - borderRows - visibleHeader.length - 1);
    const editorLines = limitEditorLines(this.editor.render(innerWidth), bodyRows);
    const content = [...visibleHeader, ...editorLines, help];
    this.lines = compact
      ? content.map((line) => truncateToWidth(line, safeWidth))
      : frame(content[0] ?? title, content.slice(1), safeWidth, this.theme);
    return this.lines;
  }

  handleInput(data: string): void {
    if (this.closed) return;
    if (matchesKey(data, Key.escape)) {
      this.finish({ kind: "cancelled" });
      return;
    }
    if (data === "\n" || this.keybindings.matches(data, "tui.input.newLine")) {
      this.editor.handleInput(data);
      this.refresh();
      return;
    }
    if (this.keybindings.matches(data, "tui.input.submit")) {
      this.finish({ kind: "confirmed", text: this.readExpandedText() });
      return;
    }
    this.editor.handleInput(data);
    this.refresh();
  }

  invalidate(): void {
    this.lines = undefined;
    this.cachedWidth = undefined;
    this.cachedRows = undefined;
    this.editor.invalidate();
  }

  dispose(): void {
    this.closed = true;
    this.signal.removeEventListener("abort", this.onAbort);
    this.editor.dispose?.();
  }

  private readExpandedText(): string {
    return this.editor.getExpandedText?.() ?? this.editor.getText();
  }

  private finish(result: DraftInputResult): void {
    if (this.closed) return;
    this.closed = true;
    this.signal.removeEventListener("abort", this.onAbort);
    this.done(result);
  }

  private refresh(): void {
    this.lines = undefined;
    this.tui.requestRender();
  }
}

class RequestScreen<T> implements Component {
  private signal: AbortSignal | undefined;
  private cancel: (() => void) | undefined;
  private done: ((result: RequestWaitResult<T>) => void) | undefined;
  private receiver: RequestResultReceiver<T> | undefined;
  private readonly loader: BorderedLoader;
  private closed = false;
  private disposed = false;
  private onAbort: (() => void) | undefined;

  constructor(options: {
    tui: TUI;
    theme: Theme;
    signal: AbortSignal;
    cancel: () => void;
    done: (result: RequestWaitResult<T>) => void;
    label: string;
    receiver: RequestResultReceiver<T>;
  }) {
    const { tui, theme, signal, cancel, done, label, receiver } = options;
    this.signal = signal;
    this.cancel = cancel;
    this.done = done;
    this.receiver = receiver;
    this.loader = new BorderedLoader(tui, theme, label);
    this.loader.onAbort = () => this.cancelAndFinish();
    if (!receiver.attach(this)) {
      this.dispose();
      return;
    }
    if (this.closed) return;

    this.onAbort = () => this.cancelAndFinish();
    if (signal.aborted) this.onAbort();
    else signal.addEventListener("abort", this.onAbort, { once: true });
  }

  render(width: number): string[] {
    return this.loader.render(width);
  }

  handleInput(data: string): void {
    if (!this.closed) this.loader.handleInput(data);
  }

  invalidate(): void {
    this.loader.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const cancel = this.closed ? undefined : this.cancel;
    this.closed = true;
    this.releaseCallbacks();
    this.loader.dispose();
    cancel?.();
  }

  finish(result: RequestWaitResult<T>): void {
    if (this.closed) return;
    this.closed = true;
    const done = this.done;
    this.releaseCallbacks();
    done?.(result);
  }

  private cancelAndFinish(): void {
    const cancel = this.cancel;
    this.finish({ kind: "cancelled" });
    cancel?.();
  }

  private releaseCallbacks(): void {
    const signal = this.signal;
    const onAbort = this.onAbort;
    this.signal = undefined;
    this.onAbort = undefined;
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);

    const receiver = this.receiver;
    this.receiver = undefined;
    receiver?.detach(this);
    this.cancel = undefined;
    this.done = undefined;
    this.loader.onAbort = undefined;
  }
}

function overlayMaxRows(tui: TUI, maxHeightPercent: number): number {
  const rows = Math.max(1, tui.terminal.rows ?? 24);
  const availableRows = Math.max(1, rows - 2);
  return Math.max(1, Math.min(Math.floor((rows * maxHeightPercent) / 100), availableRows));
}

function limitEditorLines(lines: string[], maxRows: number): string[] {
  if (lines.length <= maxRows) return lines;
  const rowLimit = Math.max(1, maxRows);
  const cursorIndex = lines.findIndex((line) => line.includes(CURSOR_MARKER));
  const lastStart = Math.max(0, lines.length - rowLimit);
  const start =
    cursorIndex < 0 ? lastStart : Math.max(0, Math.min(cursorIndex - rowLimit + 1, lastStart));
  return lines.slice(start, start + rowLimit);
}
