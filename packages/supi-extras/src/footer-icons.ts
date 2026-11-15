/**
 * Footer icon sets.
 *
 * `auto` cannot detect the terminal font. It assumes a Nerd Font on a local
 * UTF-8 TTY, uses portable Unicode over SSH (the font lives on the client),
 * and falls back to ASCII otherwise. Users can force any mode via settings.
 */

export const ICON_MODES = ["auto", "nerd", "unicode", "ascii"] as const;
export type IconMode = (typeof ICON_MODES)[number];
export type ResolvedIconMode = Exclude<IconMode, "auto">;

export interface FooterGlyphs {
  mode: ResolvedIconMode;
  /**
   * Separator after the folder icon. The Nerd Font folder glyph renders two
   * cells wide while counting as one, so it needs an extra space.
   */
  iconGap: string;
  /** Prefix for the working directory; empty means no icon. */
  cwd: string;
  /** Prefix for the Git branch; empty means the legacy `(branch)` format. */
  branch: string;
  session: string;
  ahead: string;
  behind: string;
  staged: string;
  modified: string;
  untracked: string;
  deleted: string;
  renamed: string;
  conflicted: string;
  stashed: string;
}

const NERD: FooterGlyphs = {
  mode: "nerd",
  iconGap: "  ",
  cwd: "\uF07B", // nf-fa-folder
  branch: "\uF418", // nf-oct-git_branch
  session: "\uF02E", // nf-fa-bookmark
  ahead: "⇡",
  behind: "⇣",
  staged: "+",
  modified: "!",
  untracked: "?",
  deleted: "✘",
  renamed: "»",
  conflicted: "=",
  stashed: "\uF01C", // nf-fa-inbox
};

const UNICODE: FooterGlyphs = {
  ...NERD,
  mode: "unicode",
  iconGap: " ",
  cwd: "▸",
  branch: "⎇",
  session: "•",
  ahead: "↑",
  behind: "↓",
  stashed: "≡",
};

const ASCII: FooterGlyphs = {
  mode: "ascii",
  iconGap: " ",
  cwd: "",
  branch: "",
  session: "•",
  ahead: "^",
  behind: "v",
  staged: "+",
  modified: "!",
  untracked: "?",
  deleted: "x",
  renamed: "r",
  conflicted: "=",
  stashed: "$",
};

/** Narrow an unknown config value to an icon mode. */
export function isIconMode(value: unknown): value is IconMode {
  return typeof value === "string" && (ICON_MODES as readonly string[]).includes(value);
}

/** Resolve `auto` from the terminal environment. */
export function resolveIconMode(
  mode: IconMode,
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = process.stdout.isTTY === true,
): ResolvedIconMode {
  if (mode !== "auto") return mode;
  if (env.TERM === "dumb" || !isTTY) return "ascii";
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG;
  if (locale && !/utf-?8/i.test(locale)) return "ascii";
  if (env.SSH_TTY || env.SSH_CONNECTION) return "unicode";
  return "nerd";
}

export function getFooterGlyphs(mode: ResolvedIconMode): FooterGlyphs {
  if (mode === "nerd") return NERD;
  if (mode === "unicode") return UNICODE;
  return ASCII;
}
