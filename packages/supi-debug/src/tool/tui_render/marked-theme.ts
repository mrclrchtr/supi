import type { Theme, ThemeStyle } from "@earendil-works/pi-coding-agent";

// Markers are zero-width OSC sequences while rendering, so wrapping and truncation match the
// real TUI. `decodeMarkers()` turns them into readable tokens afterwards.
const MARKER_PREFIX = "\x1b]8737;supi-mark;";
// biome-ignore lint/suspicious/noControlCharactersInRegex: matches the OSC marker sequences above.
const MARKER_PATTERN = /\x1b\]8737;supi-mark;([+-])([^\x07]*)\x07/g;

const open = (token: string) => `${MARKER_PREFIX}+${token}\x07`;
const close = (token: string) => `${MARKER_PREFIX}-${token}\x07`;
const mark = (token: string, text: string) => `${open(token)}${text}${close(token)}`;

/**
 * Wrap a live theme so styling methods emit tone markers instead of ANSI escapes.
 *
 * After {@link decodeMarkers}, the format matches `createMarkedTheme()` in
 * `@mrclrchtr/supi-test-utils`: `fg("success", "0")` → `[success]0[/success]`,
 * `bg(c, t)` → `[bg:c]t[/bg:c]`, and `bold`/`italic`/`underline`/`inverse`/`strikethrough`
 * mark with their own names. `style()` marks its `dim` attribute as `faint` and non-token
 * colors as `custom`. Every other member (for example `getFgAnsi()`) keeps the live behavior.
 */
export function createMarkingTheme(base: Theme): Theme {
  const theme = Object.create(base) as Theme;
  const color = (value: unknown) => (typeof value === "string" ? value : "custom");
  Object.assign(theme, {
    fg: (token: string, text: string) => mark(token, text),
    bg: (token: string, text: string) => mark(`bg:${token}`, text),
    bold: (text: string) => mark("bold", text),
    italic: (text: string) => mark("italic", text),
    underline: (text: string) => mark("underline", text),
    inverse: (text: string) => mark("inverse", text),
    strikethrough: (text: string) => mark("strikethrough", text),
    style: (text: string, options: ThemeStyle) => {
      const tokens = [
        options.fg === undefined ? undefined : color(options.fg),
        options.bg === undefined ? undefined : `bg:${color(options.bg)}`,
        options.bold && "bold",
        options.dim && "faint",
        options.italic && "italic",
        options.underline && "underline",
        options.inverse && "inverse",
        options.strikethrough && "strikethrough",
      ].filter((token): token is string => typeof token === "string");
      return tokens.reduceRight((styled, token) => mark(token, styled), text);
    },
  });
  return theme;
}

/**
 * Replace rendered markers with `[token]` / `[/token]`. A span that wraps opens on one line
 * and closes on a later one.
 */
export function decodeMarkers(line: string): string {
  return line.replace(MARKER_PATTERN, (_match, sign: string, token: string) =>
    sign === "+" ? `[${token}]` : `[/${token}]`,
  );
}
