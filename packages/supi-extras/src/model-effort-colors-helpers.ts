/**
 * Pure helpers for model-effort-colors extension.
 * Extracted to keep the extension entrypoint under complexity / line-count limits.
 */
import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

/** Push token-metric parts (↑ ↓ R W) onto the array. */
function pushTokenParts(parts: string[], usage: UsageTotals): void {
  if (usage.totalInput) parts.push(`↑${formatTokens(usage.totalInput)}`);
  if (usage.totalOutput) parts.push(`↓${formatTokens(usage.totalOutput)}`);
  if (usage.totalCacheRead) parts.push(`R${formatTokens(usage.totalCacheRead)}`);
  if (usage.totalCacheWrite) parts.push(`W${formatTokens(usage.totalCacheWrite)}`);
}

/**
 * Push CH (cumulative session cache hit rate) onto the array.
 * Denominator includes cacheRead + cacheWrite + input (matches PI's built-in footer).
 * Contrast with TCH which is per-turn and excludes cacheWrite.
 */
function pushCHPart(parts: string[], usage: UsageTotals): void {
  const { totalCacheRead, totalCacheWrite, totalInput } = usage;
  const denom = totalCacheRead + totalCacheWrite + totalInput;
  if ((totalCacheRead > 0 || totalCacheWrite > 0) && denom > 0) {
    parts.push(`CH${((totalCacheRead / denom) * 100).toFixed(1)}%`);
  }
}

/** Build the core stats parts array (↑↓RW CH extra cost context). */
function buildStatsParts(
  usage: UsageTotals,
  params: {
    contextWindow: number;
    percent: number | null;
    useSubscription: boolean;
    extraParts?: string[];
    suffixParts?: string[];
  },
): string[] {
  const { totalCost } = usage;
  const { contextWindow, percent, useSubscription, extraParts, suffixParts } = params;
  const contextPercent = percent != null ? percent.toFixed(1) : "?";

  const parts: string[] = [];
  pushTokenParts(parts, usage);
  pushCHPart(parts, usage);

  for (const part of extraParts ?? []) {
    if (part) parts.push(part);
  }

  if (totalCost || useSubscription) {
    parts.push(`$${totalCost.toFixed(3)}${useSubscription ? " (sub)" : ""}`);
  }

  parts.push(
    contextPercent === "?"
      ? `?/${formatTokens(contextWindow)}`
      : `${contextPercent}%/${formatTokens(contextWindow)}`,
  );

  for (const part of suffixParts ?? []) {
    if (part) parts.push(part);
  }

  return parts;
}

/** Build the left-side stats string. */
export function buildStatsLeft(params: {
  contextWindow: number;
  percent: number | null;
  usage: UsageTotals;
  useSubscription: boolean;
  /** Extra parts inserted after CH, before cost and context. */
  extraParts?: string[];
  /** Extra parts appended after cost and context. */
  suffixParts?: string[];
}): { text: string; contextPercentValue: number } {
  const { usage } = params;
  const contextPercentValue = params.percent ?? 0;
  const parts = buildStatsParts(usage, params);
  return { text: parts.join(" "), contextPercentValue };
}

// ---- context-percent coloring ----

/** Color the context-% portion based on thresholds. */
export function colorContextPercent(statsLeft: string, pctVal: number, theme: FooterTheme): string {
  if (pctVal > 90) {
    return statsLeft.replace(/\d+\.?\d*%/, (m) => theme.fg("error", m));
  }
  if (pctVal > 70) {
    return statsLeft.replace(/\d+\.?\d*%/, (m) => theme.fg("warning", m));
  }
  return statsLeft;
}

// ---- right-side builders ----

/** Build the styled right portion (model name + effort level). */
export function styleRightSide(params: {
  model: ModelInfo | undefined;
  thinkingLevel: string;
  theme: FooterTheme;
  statsLeftWidth: number;
  availableWidth: number;
}): { plain: string; styled: string } {
  const { model, thinkingLevel, theme, statsLeftWidth, availableWidth } = params;

  const modelName = model?.id ?? "no-model";
  const effortLabel = thinkingLevel === "off" ? "thinking off" : thinkingLevel.toLowerCase();

  let plain = modelName;
  if (model?.reasoning) {
    plain = `${modelName} • ${effortLabel}`;
  }
  if (model?.provider) {
    const withProvider = `(${model.provider}) ${plain}`;
    if (statsLeftWidth + 2 + visibleWidth(withProvider) <= availableWidth) {
      plain = withProvider;
    }
  }

  const providerToken = providerThemeToken(model?.provider);
  const thinkingToken = thinkingThemeToken(thinkingLevel);
  const providerPrefix = model?.provider ? `(${model.provider}) ` : "";

  let styled = "";
  if (providerPrefix) styled += theme.fg("dim", providerPrefix);
  styled += theme.fg(providerToken, modelName);

  if (model?.reasoning) {
    styled += theme.fg("dim", " • ");
    styled += theme.fg(thinkingToken, effortLabel);
  }

  return { plain, styled };
}

/** Apply right-justified padding between stats and right side. */
export function layoutRightSide(params: {
  plain: string;
  styled: string;
  statsLeftWidth: number;
  availableWidth: number;
}): { styled: string; padding: string } {
  const { plain, styled, statsLeftWidth, availableWidth } = params;
  const rightWidth = visibleWidth(plain);
  const minPadding = 2;

  if (statsLeftWidth + minPadding + rightWidth <= availableWidth) {
    return { styled, padding: " ".repeat(availableWidth - statsLeftWidth - rightWidth) };
  }

  const avail = availableWidth - statsLeftWidth - minPadding;
  if (avail <= 0) {
    return { styled: "", padding: "" };
  }

  const finalStyled = truncateToWidth(styled, avail + (styled.length - plain.length), "");
  const finalPlain = truncateToWidth(plain, avail, "");
  const padding = " ".repeat(
    Math.max(0, availableWidth - statsLeftWidth - visibleWidth(finalPlain)),
  );
  return { styled: finalStyled, padding };
}

// ---- path line ----

/** Build the working-directory line for the footer. */
export function buildPwdLine(params: {
  cwd: string;
  gitBranch: string | null;
  sessionName: string | undefined;
}): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  let pwd = params.cwd;
  if (home && pwd.startsWith(home)) {
    pwd = `~${pwd.slice(home.length)}`;
  }
  if (params.gitBranch) pwd = `${pwd} (${params.gitBranch})`;
  if (params.sessionName) pwd = `${pwd} • ${params.sessionName}`;
  return pwd;
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
