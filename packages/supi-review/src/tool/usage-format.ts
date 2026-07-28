import type { Usage } from "@earendil-works/pi-ai";

/** Format nested-model usage consistently across Markdown and TUI surfaces. */
export function formatReviewUsage(usage: Usage): string {
  const tokens = `${usage.totalTokens.toLocaleString("en-US")} tokens`;
  const parts = [
    tokens,
    `${usage.input.toLocaleString("en-US")} in`,
    `${usage.output.toLocaleString("en-US")} out`,
  ];
  if (usage.cacheRead > 0) parts.push(`${usage.cacheRead.toLocaleString("en-US")} cache read`);
  if (usage.cacheWrite > 0) parts.push(`${usage.cacheWrite.toLocaleString("en-US")} cache write`);
  if (usage.cost.total > 0) parts.push(`$${usage.cost.total.toFixed(4)}`);
  return parts.join(" · ");
}
