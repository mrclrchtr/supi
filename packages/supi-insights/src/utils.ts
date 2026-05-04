// Utility helpers for supi-insights

import { extname } from "node:path";

// ── Retry helper for LLM calls ────────────────────────────

/**
 * Attempt an async operation with retries and exponential backoff.
 * Returns the result on success, or null if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 1000,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (_err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
      }
    }
  }
  return null;
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".rb": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".md": "Markdown",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".sh": "Shell",
  ".css": "CSS",
  ".html": "HTML",
};

export function getLanguageFromPath(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}

export function countCharInString(str: string, char: string): number {
  let count = 0;
  for (const c of str) {
    if (c === char) count++;
  }
  return count;
}

export function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Escape HTML but render **bold** as <strong>
export function escapeHtmlWithBold(text: string): string {
  const escaped = escapeXmlAttr(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function emptyHtml(message: string): string {
  const tag = "p";
  return `<${tag} class="empty">${escapeXmlAttr(message)}</${tag}>`;
}

export function generateBarChartHtml(
  data: Record<string, number>,
  color: string,
  maxItems = 6,
  fixedOrder?: string[],
): string {
  let entries: [string, number][];

  if (fixedOrder) {
    entries = fixedOrder
      .filter((key) => key in data && (data[key] ?? 0) > 0)
      .map((key) => [key, data[key] ?? 0] as [string, number]);
  } else {
    entries = Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxItems);
  }

  if (entries.length === 0) return emptyHtml("No data");

  const maxVal = Math.max(...entries.map((e) => e[1]));
  return entries
    .map(([label, count]) => {
      const pct = maxVal > 0 ? (count / maxVal) * 100 : 0;
      const cleanLabel =
        LABEL_MAP[label] ?? label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `<div class="bar-row">
        <div class="bar-label">${escapeXmlAttr(cleanLabel)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
        <div class="bar-value">${count}</div>
      </div>`;
    })
    .join("\n");
}

export function generateResponseTimeHistogramHtml(times: number[]): string {
  if (times.length === 0) return emptyHtml("No response time data");

  const buckets = RESPONSE_TIME_BUCKETS.map((bucket) => ({ ...bucket, count: 0 }));
  for (const t of times) {
    const bucket = buckets.find((item) => t < item.lessThan) ?? buckets.at(-1);
    if (bucket) bucket.count++;
  }

  const maxVal = Math.max(...buckets.map((bucket) => bucket.count));
  if (maxVal === 0) return emptyHtml("No response time data");

  return buckets
    .map(({ label, count }) => {
      const pct = maxVal > 0 ? (count / maxVal) * 100 : 0;
      return `<div class="bar-row">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:#6366f1"></div></div>
        <div class="bar-value">${count}</div>
      </div>`;
    })
    .join("\n");
}

const RESPONSE_TIME_BUCKETS = [
  { label: "2-10s", lessThan: 10 },
  { label: "10-30s", lessThan: 30 },
  { label: "30s-1m", lessThan: 60 },
  { label: "1-2m", lessThan: 120 },
  { label: "2-5m", lessThan: 300 },
  { label: "5-15m", lessThan: 900 },
  { label: ">15m", lessThan: Number.POSITIVE_INFINITY },
];

export function generateTimeOfDayChartHtml(messageHours: number[], utcOffset = 0): string {
  if (messageHours.length === 0) return emptyHtml("No time data");

  const periods = [
    { label: "Morning (6-12)", range: [6, 7, 8, 9, 10, 11] },
    { label: "Afternoon (12-18)", range: [12, 13, 14, 15, 16, 17] },
    { label: "Evening (18-24)", range: [18, 19, 20, 21, 22, 23] },
    { label: "Night (0-6)", range: [0, 1, 2, 3, 4, 5] },
  ];

  const hourCounts: Record<number, number> = {};
  for (const h of messageHours) {
    const localHour = (h + utcOffset + 24) % 24;
    hourCounts[localHour] = (hourCounts[localHour] ?? 0) + 1;
  }

  const periodCounts = periods.map((p) => ({
    label: p.label,
    count: p.range.reduce((sum, h) => sum + (hourCounts[h] ?? 0), 0),
  }));

  const maxVal = Math.max(...periodCounts.map((p) => p.count)) || 1;

  return periodCounts
    .map(
      (p) => `
      <div class="bar-row">
        <div class="bar-label">${p.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${((p.count / maxVal) * 100).toFixed(1)}%;background:#8b5cf6"></div></div>
        <div class="bar-value">${p.count}</div>
      </div>`,
    )
    .join("\n");
}

export function getHourCountsJson(messageHours: number[]): string {
  const hourCounts: Record<number, number> = {};
  for (const h of messageHours) {
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  return JSON.stringify(hourCounts);
}

export const LABEL_MAP: Record<string, string> = {
  debug_investigate: "Debug/Investigate",
  implement_feature: "Implement Feature",
  fix_bug: "Fix Bug",
  write_script_tool: "Write Script/Tool",
  refactor_code: "Refactor Code",
  configure_system: "Configure System",
  create_pr_commit: "Create PR/Commit",
  analyze_data: "Analyze Data",
  understand_codebase: "Understand Codebase",
  write_tests: "Write Tests",
  write_docs: "Write Docs",
  deploy_infra: "Deploy/Infra",
  warmup_minimal: "Cache Warmup",
  fast_accurate_search: "Fast/Accurate Search",
  correct_code_edits: "Correct Code Edits",
  good_explanations: "Good Explanations",
  proactive_help: "Proactive Help",
  multi_file_changes: "Multi-file Changes",
  handled_complexity: "Multi-file Changes",
  good_debugging: "Good Debugging",
  misunderstood_request: "Misunderstood Request",
  wrong_approach: "Wrong Approach",
  buggy_code: "Buggy Code",
  user_rejected_action: "User Rejected Action",
  claude_got_blocked: "Claude Got Blocked",
  user_stopped_early: "User Stopped Early",
  wrong_file_or_location: "Wrong File/Location",
  excessive_changes: "Excessive Changes",
  slow_or_verbose: "Slow/Verbose",
  tool_failed: "Tool Failed",
  user_unclear: "User Unclear",
  external_issue: "External Issue",
  frustrated: "Frustrated",
  dissatisfied: "Dissatisfied",
  likely_satisfied: "Likely Satisfied",
  satisfied: "Satisfied",
  happy: "Happy",
  unsure: "Unsure",
  neutral: "Neutral",
  delighted: "Delighted",
  single_task: "Single Task",
  multi_task: "Multi Task",
  iterative_refinement: "Iterative Refinement",
  exploration: "Exploration",
  quick_question: "Quick Question",
  fully_achieved: "Fully Achieved",
  mostly_achieved: "Mostly Achieved",
  partially_achieved: "Partially Achieved",
  not_achieved: "Not Achieved",
  unclear_from_transcript: "Unclear",
  unhelpful: "Unhelpful",
  slightly_helpful: "Slightly Helpful",
  moderately_helpful: "Moderately Helpful",
  very_helpful: "Very Helpful",
  essential: "Essential",
};

export const SATISFACTION_ORDER = [
  "frustrated",
  "dissatisfied",
  "likely_satisfied",
  "satisfied",
  "happy",
  "unsure",
];

export const OUTCOME_ORDER = [
  "not_achieved",
  "partially_achieved",
  "mostly_achieved",
  "fully_achieved",
  "unclear_from_transcript",
];
