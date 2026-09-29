import type { ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type Focusable,
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { frame } from "./ui-primitives.ts";

type ReviewUi = Pick<ExtensionUIContext, "custom">;

export type ProposalReviewResult = "accept" | "dismiss";

/** Show a proposal and let the user accept or dismiss it. */
export function reviewProposal(
  ui: ReviewUi,
  signal: AbortSignal,
  details: {
    proposal: string;
    original: string;
    model: string;
    includedContext: readonly string[];
  },
): Promise<ProposalReviewResult | undefined> {
  return ui.custom<ProposalReviewResult | undefined>(
    (tui, theme, _keybindings, done) =>
      new ProposalReviewScreen({ tui, theme, signal, details, done }),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "92%", maxHeight: "88%", margin: 1 },
    },
  );
}

class ProposalReviewScreen implements Component, Focusable {
  focused = false;
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly signal: AbortSignal;
  private readonly details: {
    proposal: string;
    original: string;
    model: string;
    includedContext: readonly string[];
  };
  private readonly done: (result: ProposalReviewResult | undefined) => void;
  private showingOriginal = false;
  private scrollOffset = 0;
  private lines: string[] | undefined;
  private cachedWidth: number | undefined;
  private cachedRows: number | undefined;
  private closed = false;
  private readonly onAbort: () => void;

  constructor(options: {
    tui: TUI;
    theme: Theme;
    signal: AbortSignal;
    details: {
      proposal: string;
      original: string;
      model: string;
      includedContext: readonly string[];
    };
    done: (result: ProposalReviewResult | undefined) => void;
  }) {
    const { tui, theme, signal, details, done } = options;
    this.tui = tui;
    this.theme = theme;
    this.signal = signal;
    this.details = details;
    this.done = done;
    this.onAbort = () => this.finish(undefined);
    if (signal.aborted) this.onAbort();
    else signal.addEventListener("abort", this.onAbort, { once: true });
  }

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const rows = Math.max(1, this.tui.terminal.rows ?? 24);
    if (this.lines && this.cachedWidth === safeWidth && this.cachedRows === rows) return this.lines;
    this.cachedWidth = safeWidth;
    this.cachedRows = rows;

    const overlayRows = overlayMaxRows(this.tui, 88);
    const compact = overlayRows < 12 || safeWidth < 40;
    const borderRows = compact ? 0 : 2;
    const bodyWidth = compact ? safeWidth : Math.max(1, safeWidth - 4);
    const bodyText = this.showingOriginal ? this.details.original : this.details.proposal;
    const body = bodyText.split("\n").flatMap((line) => wrapTextWithAnsi(line || " ", bodyWidth));
    const heading = this.showingOriginal ? "Original draft" : "Proposed draft";
    const categories = this.details.includedContext.length
      ? this.details.includedContext.join(", ")
      : "no background context";
    const header = compact
      ? [
          this.theme.fg("accent", heading),
          this.theme.fg("dim", truncateToWidth(`Model: ${this.details.model}`, bodyWidth)),
          this.theme.fg("dim", truncateToWidth(`Sent background: ${categories}`, bodyWidth)),
        ]
      : [
          this.theme.fg("accent", heading),
          ...wrapTextWithAnsi(`Model: ${this.details.model}`, bodyWidth).map((line) =>
            this.theme.fg("dim", line),
          ),
          ...wrapTextWithAnsi(`Sent background: ${categories}`, bodyWidth).map((line) =>
            this.theme.fg("dim", line),
          ),
        ];
    const footerText = this.theme.fg(
      "dim",
      compact
        ? "↑↓ scroll · Enter · Esc dismiss"
        : "o original/proposal · ↑↓ scroll · Enter accept · Esc dismiss",
    );
    const footer = compact
      ? [truncateToWidth(footerText, bodyWidth)]
      : wrapTextWithAnsi(footerText, bodyWidth).slice(0, 2);
    const maxHeaderRows = Math.max(1, overlayRows - borderRows - footer.length - 1);
    const visibleHeader = header.slice(0, maxHeaderRows);
    const maxRows = Math.max(1, overlayRows - borderRows - visibleHeader.length - footer.length);
    const maxOffset = Math.max(0, body.length - maxRows);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    const lines = [
      ...visibleHeader,
      ...body.slice(this.scrollOffset, this.scrollOffset + maxRows),
      ...footer,
    ];
    this.lines = compact
      ? lines.map((line) => truncateToWidth(line, safeWidth))
      : frame(lines[0] ?? heading, lines.slice(1), safeWidth, this.theme);
    return this.lines;
  }

  handleInput(data: string): void {
    if (this.closed) return;
    if (matchesKey(data, Key.escape)) {
      this.finish("dismiss");
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.finish("accept");
      return;
    }
    if (data.toLowerCase() === "o") {
      this.showingOriginal = !this.showingOriginal;
      this.scrollOffset = 0;
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.pageUp)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.refresh();
      return;
    }
    if (matchesKey(data, Key.down) || matchesKey(data, Key.pageDown)) {
      this.scrollOffset += matchesKey(data, Key.pageDown) ? 10 : 1;
      this.refresh();
    }
  }

  invalidate(): void {
    this.lines = undefined;
    this.cachedWidth = undefined;
    this.cachedRows = undefined;
  }

  dispose(): void {
    this.closed = true;
    this.signal.removeEventListener("abort", this.onAbort);
  }

  private finish(result: ProposalReviewResult | undefined): void {
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

function overlayMaxRows(tui: TUI, maxHeightPercent: number): number {
  const rows = Math.max(1, tui.terminal.rows ?? 24);
  const availableRows = Math.max(1, rows - 2);
  return Math.max(1, Math.min(Math.floor((rows * maxHeightPercent) / 100), availableRows));
}
