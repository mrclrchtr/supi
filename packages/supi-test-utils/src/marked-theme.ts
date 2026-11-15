/**
 * Test theme that records style tokens in rendered text so TUI render tests can assert tone.
 *
 * The production `Theme` emits ANSI escapes and a plain test theme (`fg: (_c, t) => t`) discards
 * the color, so neither lets a test tell a success-colored count from a dimmed or warning one.
 */

/** Structural subset of Pi's `Theme` styling API implemented by {@link createMarkedTheme}. */
export interface MarkedTheme {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  underline: (text: string) => string;
  inverse: (text: string) => string;
  strikethrough: (text: string) => string;
}

/**
 * Create a theme that wraps styled text in readable tokens instead of ANSI escapes.
 *
 * - `fg(color, text)` → `[color]text[/color]`
 * - `bg(color, text)` → `[bg:color]text[/bg:color]`
 * - `bold(text)` → `[bold]text[/bold]`; `italic`, `underline`, `inverse`, and
 *   `strikethrough` mark the same way with their own names.
 *
 * Nesting is preserved, so `fg("success", bold("0"))` renders `[success][bold]0[/bold][/success]`.
 * Pass it where a renderer expects Pi's `Theme` (cast with `as never` or
 * `as unknown as Theme`).
 *
 * Tokens add width, so renderers that wrap or truncate by visible width may break lines differently
 * than with a plain theme; render at a generous width when asserting tone.
 *
 * @example
 * ```ts
 * const theme = createMarkedTheme();
 * const line = renderHealthResult(result, { expanded: false, isPartial: false }, theme as never, undefined)
 *   .render(200)
 *   .join("\n");
 * expect(line).toContain("[dim]diag[/dim] [muted]none checked");
 * expect(line).not.toContain("[success][bold]0");
 * ```
 */
export function createMarkedTheme(): MarkedTheme {
  const mark = (token: string, text: string) => `[${token}]${text}[/${token}]`;
  return {
    fg: (color, text) => mark(color, text),
    bg: (color, text) => mark(`bg:${color}`, text),
    bold: (text) => mark("bold", text),
    italic: (text) => mark("italic", text),
    underline: (text) => mark("underline", text),
    inverse: (text) => mark("inverse", text),
    strikethrough: (text) => mark("strikethrough", text),
  };
}
