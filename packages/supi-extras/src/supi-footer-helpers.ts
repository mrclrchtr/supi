/**
 * Pure helpers for supi-footer extension.
 * Extracted to keep the extension entrypoint under complexity / line-count limits.
 */
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterGlyphs } from "./footer-icons.ts";

// ---- re-exports for the extension entrypoint ----

export type ModelInfo = {
  id?: string;
  provider?: string;
  reasoning?: boolean;
  contextWindow?: number;
};

export interface UsageEntry {
  type: string;
  message?: {
    role: string;
    usage: {
      input: number;
      output: number;
      cacheRead?: number;
      cacheWrite?: number;
      cost: { total: number };
    };
  };
}

export interface UsageTotals {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
}

export interface FooterTheme {
  fg(color: ThemeColor, text: string): string;
}

export interface FooterData {
  getGitBranch(): string | null;
  getExtensionStatuses(): ReadonlyMap<string, string>;
  onBranchChange(cb: () => void): () => void;
}

// ---- color mappings ----

const PROVIDER_PATTERNS: Array<[RegExp, ThemeColor]> = [
  [/anthropic|claude/, "accent"],
  [/openai|gpt|chatgpt/, "success"],
  [/google|gemini/, "warning"],
  [/mistral|codestral/, "muted"],
  [/xai|grok/, "thinkingXhigh"],
  [/deepseek/, "thinkingHigh"],
  [/meta|llama/, "thinkingMedium"],
  [/ollama|local/, "dim"],
];

export function providerThemeToken(provider: string | undefined): ThemeColor {
  const haystack = String(provider ?? "").toLowerCase();
  for (const [re, color] of PROVIDER_PATTERNS) {
    if (re.test(haystack)) return color;
  }
  return "dim";
}

export function thinkingThemeToken(level: string): ThemeColor {
  switch (level.toLowerCase()) {
    case "off":
      return "thinkingOff";
    case "minimal":
      return "thinkingMinimal";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    case "xhigh":
      return "thinkingXhigh";
    case "max":
      return "thinkingMax";
    default:
      return "dim";
  }
}

// ---- formatting helpers ----

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

export function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

// ---- usage aggregation ----

/** Aggregate token/cost usage across all assistant messages. */
export function gatherUsage(entries: ReadonlyArray<UsageEntry>): UsageTotals {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;

  for (const entry of entries) {
    if (entry.type === "message" && entry.message?.role === "assistant") {
      const u = entry.message.usage;
      totalInput += u.input;
      totalOutput += u.output;
      totalCacheRead += u.cacheRead ?? 0;
      totalCacheWrite += u.cacheWrite ?? 0;
      totalCost += u.cost.total;
    }
  }

  return { totalInput, totalOutput, totalCacheRead, totalCacheWrite, totalCost };
}

// ---- stats builder ----

/** Applies a theme color; identity in plain-text contexts. */
export type FooterStyle = (color: ThemeColor, text: string) => string;

const plainStyle: FooterStyle = (_color, text) => text;

const CONTEXT_BAR_CELLS = 5;

/** Label in muted, value in text, e.g. `↑1.2k`. */
function metric(style: FooterStyle, label: string, value: string): string {
  return style("muted", label) + style("text", value);
}

/** Token totals: `↑input ↓output`. */
function tokenGroup(usage: UsageTotals, style: FooterStyle): string[] {
  const parts: string[] = [];
  if (usage.totalInput) parts.push(metric(style, "↑", formatTokens(usage.totalInput)));
  if (usage.totalOutput) parts.push(metric(style, "↓", formatTokens(usage.totalOutput)));
  return parts;
}

/**
 * Cache totals and CH (cumulative session cache hit rate).
 * Denominator includes cacheRead + cacheWrite + input (matches PI's built-in footer).
 * Contrast with TCH which is per-turn and excludes cacheWrite.
 */
function cacheGroup(usage: UsageTotals, style: FooterStyle): string[] {
  const { totalCacheRead, totalCacheWrite, totalInput } = usage;
  const parts: string[] = [];
  if (totalCacheRead) parts.push(metric(style, "R", formatTokens(totalCacheRead)));
  if (totalCacheWrite) parts.push(metric(style, "W", formatTokens(totalCacheWrite)));
  const denom = totalCacheRead + totalCacheWrite + totalInput;
  if ((totalCacheRead > 0 || totalCacheWrite > 0) && denom > 0) {
    const rate = (totalCacheRead / denom) * 100;
    const color: ThemeColor = rate >= 80 ? "success" : rate >= 50 ? "warning" : "error";
    parts.push(style("muted", "CH") + style(color, `${rate.toFixed(1)}%`));
  }
  return parts;
}

function contextColor(percent: number): ThemeColor {
  if (percent > 90) return "error";
  if (percent > 70) return "warning";
  return "muted";
}

/** Context usage: optional bar, then `percent%/window`. */
function contextGroup(
  params: { contextWindow: number; percent: number | null; bar: boolean },
  style: FooterStyle,
): string {
  const window = style("dim", `/${formatTokens(params.contextWindow)}`);
  if (params.percent == null) return style("muted", "?") + window;
  const color = contextColor(params.percent);
  const label = style(color, `${params.percent.toFixed(1)}%`) + window;
  if (!params.bar) return label;
  const filled = Math.min(
    CONTEXT_BAR_CELLS,
    Math.max(params.percent > 0 ? 1 : 0, Math.round((params.percent / 100) * CONTEXT_BAR_CELLS)),
  );
  const bar =
    style(color === "muted" ? "accent" : color, "▰".repeat(filled)) +
    style("dim", "▱".repeat(CONTEXT_BAR_CELLS - filled));
  return `${bar} ${label}`;
}

/**
 * Build the styled left side of the stats line.
 *
 * Groups (tokens, cache + `stats` contributions, cost, context) and each
 * `stats-end` contribution are joined with a dim ` · `.
 */
export function buildStatsLeft(
  params: {
    contextWindow: number;
    percent: number | null;
    usage: UsageTotals;
    useSubscription: boolean;
    /** Draw a small context bar; disable for ASCII terminals. */
    contextBar?: boolean;
    /** Extra parts inserted after CH, before cost and context. */
    extraParts?: string[];
    /** Extra parts appended after cost and context. */
    suffixParts?: string[];
  },
  style: FooterStyle = plainStyle,
): string {
  const { usage, useSubscription } = params;
  const groups: string[][] = [
    tokenGroup(usage, style),
    [...cacheGroup(usage, style), ...dimParts(params.extraParts, style)],
  ];
  if (usage.totalCost || useSubscription) {
    const sub = useSubscription ? style("dim", " sub") : "";
    groups.push([style("text", `$${usage.totalCost.toFixed(3)}`) + sub]);
  }
  groups.push([
    contextGroup(
      { contextWindow: params.contextWindow, percent: params.percent, bar: !!params.contextBar },
      style,
    ),
  ]);

  const suffix = dimParts(params.suffixParts, style).map((part) => [part]);
  return [...groups, ...suffix]
    .filter((group) => group.length > 0)
    .map((group) => group.join(" "))
    .join(sectionSeparator(style));
}

/** The one separator between footer sections: a dim ` · `. Parts inside a section use a space. */
export function sectionSeparator(style: FooterStyle = plainStyle): string {
  return style("dim", SECTION_SEPARATOR);
}

const SECTION_SEPARATOR = " · ";

/**
 * Contributions keep the former dim base color; their own styles still apply.
 * A leading `|` separator from older contributions is dropped because the
 * footer now owns separators.
 */
export function dimParts(parts: string[] | undefined, style: FooterStyle): string[] {
  return (parts ?? [])
    .map((part) => part.replace(/^\|\s*/, ""))
    .filter(Boolean)
    .map((part) => style("dim", part));
}

// ---- right-side builders ----

/**
 * Build the model side of the session line, for example `✦ (anthropic) claude · high`.
 *
 * `prefixParts` (`model-start` contributions) come first, separated by a space.
 * The provider is dropped first when the model side does not fit `maxWidth`.
 */
export function buildModelSide(params: {
  model: ModelInfo | undefined;
  thinkingLevel: string;
  theme: FooterTheme;
  prefixParts?: string[];
  /** Width available for the whole model side. */
  maxWidth: number;
}): string {
  const { model, thinkingLevel, theme } = params;
  const style: FooterStyle = (color, text) => theme.fg(color, text);
  const modelName = model?.id ?? "no-model";
  const effortLabel = thinkingLevel === "off" ? "thinking off" : thinkingLevel.toLowerCase();

  let core = style(providerThemeToken(model?.provider), modelName);
  if (model?.reasoning) {
    core += sectionSeparator(style) + style(thinkingThemeToken(thinkingLevel), effortLabel);
  }
  const prefix = (params.prefixParts ?? []).filter(Boolean).join(" ");
  const withPrefix = (text: string) => (prefix ? `${prefix} ${text}` : text);

  if (model?.provider) {
    const withProvider = withPrefix(`${style("dim", `(${model.provider})`)} ${core}`);
    if (visibleWidth(withProvider) <= params.maxWidth) return withProvider;
  }
  return withPrefix(core);
}

/** Minimum gap between a footer line's left and right sides. */
const MIN_SIDE_GAP = 2;

/**
 * Join a line's left and right sides with right-justified padding.
 *
 * The left side keeps priority: it is truncated to `width` first, then the
 * right side is truncated into the remaining space or dropped.
 */
export function joinLeftRight(
  left: string,
  right: string,
  width: number,
  ellipsis: string,
): string {
  const fittedLeft = visibleWidth(left) > width ? truncateToWidth(left, width, ellipsis) : left;
  const leftWidth = visibleWidth(fittedLeft);
  if (!right) return fittedLeft;
  const available = width - leftWidth - MIN_SIDE_GAP;
  if (available <= 0) return fittedLeft;
  const fittedRight =
    visibleWidth(right) > available ? truncateToWidth(right, available, "") : right;
  const padding = " ".repeat(Math.max(0, width - leftWidth - visibleWidth(fittedRight)));
  return fittedLeft + padding + fittedRight;
}

// ---- path line ----

/**
 * Build the working-directory line for the footer.
 *
 * Without glyphs (ASCII mode) the branch keeps the `(branch)` format.
 */
export function buildPwdLine(
  params: {
    cwd: string;
    gitBranch: string | null;
    sessionName: string | undefined;
    /** Pre-styled Git counts appended after the branch. */
    gitStatus?: string;
    glyphs?: Pick<FooterGlyphs, "cwd" | "branch" | "session">;
  },
  style: FooterStyle = plainStyle,
): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  let path = params.cwd;
  if (home && path.startsWith(home)) {
    path = `~${path.slice(home.length)}`;
  }
  const glyphs = params.glyphs;
  const parts: string[] = [];
  parts.push((glyphs?.cwd ? `${style("accent", glyphs.cwd)} ` : "") + style("muted", path));
  if (params.gitBranch) {
    const status = params.gitStatus ? ` ${params.gitStatus}` : "";
    parts.push(
      glyphs?.branch
        ? ` ${style("accent", glyphs.branch)} ${style("accent", params.gitBranch)}${status}`
        : `${style("dim", "(")}${style("accent", params.gitBranch)}${style("dim", ")")}${status}`,
    );
  }
  if (params.sessionName) {
    parts.push(`${style("dim", glyphs?.session ?? "•")} ${style("text", params.sessionName)}`);
  }
  return parts.join(" ");
}

// ---- thinking level ----

export function latestThinkingLevel(
  entries: ReadonlyArray<{ type: string; thinkingLevel?: string }>,
): string {
  let level = "off";
  for (const e of entries) {
    if (e.type === "thinking_level_change" && e.thinkingLevel) {
      level = e.thinkingLevel;
    }
  }
  return level;
}
