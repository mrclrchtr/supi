import type { ReportColor } from "@mrclrchtr/supi-core/report";
import type { ContextAnalysis } from "./analysis.ts";

export type CategoryKey =
  | "systemPrompt"
  | "userMessages"
  | "assistantMessages"
  | "toolCalls"
  | "toolResults"
  | "other";

export const CATEGORY_ORDER: CategoryKey[] = [
  "systemPrompt",
  "userMessages",
  "assistantMessages",
  "toolCalls",
  "toolResults",
  "other",
];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  systemPrompt: "System prompt",
  userMessages: "User messages",
  assistantMessages: "Assistant messages",
  toolCalls: "Tool calls",
  toolResults: "Tool results",
  other: "Other",
};

export const CATEGORY_COLORS: Record<CategoryKey, ReportColor> = {
  systemPrompt: "accent",
  userMessages: "success",
  assistantMessages: "warning",
  toolCalls: "error",
  toolResults: "dim",
  other: "muted",
};

export function pct(value: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function padLeft(text: string, width: number): string {
  return text.padStart(width, " ");
}

export function padRight(text: string, width: number): string {
  return text.padEnd(width, " ");
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function allocateBlocks(values: number[], totalBlocks: number): number[] {
  const total = sum(values);
  if (total <= 0 || totalBlocks <= 0) {
    return values.map(() => 0);
  }

  const exact = values.map((value) => (value / total) * totalBlocks);
  const counts = exact.map((value) => Math.floor(value));
  const remaining = totalBlocks - sum(counts);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remaining; i += 1) {
    counts[byRemainder[i]?.index ?? 0] += 1;
  }

  return counts;
}

export function healthColor(analysis: ContextAnalysis): ReportColor {
  if (analysis.contextWindow <= 0) return "dim";
  const reserved = analysis.totalTokens ?? 0;
  const pressure =
    ((reserved + analysis.categories.autocompactBuffer) / analysis.contextWindow) * 100;
  if (pressure >= 90) return "error";
  if (pressure >= 70) return "warning";
  return "success";
}
