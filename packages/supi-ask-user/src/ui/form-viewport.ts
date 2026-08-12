/** Maximum number of terminal rows used by the inline Ask User form. */
const MAX_FORM_HEIGHT = 24;
const TERMINAL_HEIGHT_SHARE = 0.7;

/** A zero-based, end-exclusive range in rendered form content. */
export interface FormLineRange {
  start: number;
  end: number;
}

/** Rendered lines with an optional range that must remain visible during navigation. */
export interface RenderedFormSection {
  lines: string[];
  focusedRange?: FormLineRange;
}

/** The visible window and scroll limits calculated for one rendered form document. */
export interface FormViewportLayout {
  lines: string[];
  scrollOffset: number;
  maxScrollOffset: number;
  pageSize: number;
  hiddenAbove: number;
  hiddenBelow: number;
}

/**
 * Calculate a conservative inline height that leaves room for Pi's transcript and footer.
 * The absolute cap keeps the form stable on large terminals, while the terminal share
 * keeps it usable on small terminals.
 */
export function calculateFormHeightLimit(terminalRows: number): number {
  const rows = Math.max(1, Math.floor(terminalRows));
  const proportional = Math.max(1, Math.floor(rows * TERMINAL_HEIGHT_SHARE));
  return Math.min(rows, MAX_FORM_HEIGHT, proportional);
}

/** Offset a rendered line range while preserving its end-exclusive shape. */
export function offsetFormLineRange(
  range: FormLineRange | undefined,
  offset: number,
): FormLineRange | undefined {
  return range ? { start: range.start + offset, end: range.end + offset } : undefined;
}

/**
 * Return one visible content window. The module has no knowledge of question or form state.
 */
export function layoutFormViewport(args: {
  lines: string[];
  maxRows: number;
  scrollOffset: number;
  focusedRange?: FormLineRange;
  revealFocus: boolean;
}): FormViewportLayout {
  const pageSize = Math.max(1, Math.floor(args.maxRows));
  const maxScrollOffset = Math.max(0, args.lines.length - pageSize);
  let scrollOffset = clamp(Math.floor(args.scrollOffset), 0, maxScrollOffset);

  if (args.revealFocus && args.focusedRange) {
    const focusedStart = clamp(args.focusedRange.start, 0, Math.max(0, args.lines.length - 1));
    const focusedEnd = clamp(
      Math.max(focusedStart + 1, args.focusedRange.end),
      focusedStart + 1,
      args.lines.length,
    );
    const focusedHeight = focusedEnd - focusedStart;

    if (focusedHeight >= pageSize) {
      scrollOffset = focusedStart;
    } else if (focusedStart < scrollOffset) {
      scrollOffset = focusedStart;
    } else if (focusedEnd > scrollOffset + pageSize) {
      scrollOffset = focusedEnd - pageSize;
    }
    scrollOffset = clamp(scrollOffset, 0, maxScrollOffset);
  }

  const end = Math.min(args.lines.length, scrollOffset + pageSize);
  return {
    lines: args.lines.slice(scrollOffset, end),
    scrollOffset,
    maxScrollOffset,
    pageSize,
    hiddenAbove: scrollOffset,
    hiddenBelow: Math.max(0, args.lines.length - end),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
