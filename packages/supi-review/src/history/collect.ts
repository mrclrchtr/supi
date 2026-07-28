import type { SessionContext } from "@earendil-works/pi-coding-agent";
import { extractVisibleText } from "../tool/runner-helpers.ts";

const MAX_PLANNER_CONTEXT_CHARS = 8_000;
const MAX_SUMMARY_WITH_VISIBLE_CHARS = 3_000;
type Message = SessionContext["messages"][number];

interface PlannerRow {
  kind: "summary" | "visible";
  text: string;
}

function toPlannerRow(message: Message): PlannerRow | undefined {
  if (message.role === "compactionSummary") {
    return { kind: "summary", text: `[Summary]\n${message.summary}` };
  }
  if (message.role === "branchSummary") {
    return { kind: "summary", text: `[Branch summary]\n${message.summary}` };
  }
  if (message.role !== "user" && message.role !== "assistant") return undefined;
  const text = extractVisibleText(message.content)?.trim();
  if (!text) return undefined;
  const label = message.role === "user" ? "User" : "Assistant";
  return { kind: "visible", text: `[${label}]\n${text}` };
}

function takeRecentRows(rows: string[], maxChars: number): string {
  const recent: string[] = [];
  let size = 0;
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const separator = recent.length > 0 ? 1 : 0;
    const remaining = maxChars - size - separator;
    if (row.length > remaining) {
      if (recent.length === 0 && remaining > 0) {
        const marker = "\n[… truncated]";
        recent.unshift(
          remaining > marker.length
            ? `${row.slice(0, remaining - marker.length)}${marker}`
            : row.slice(0, remaining),
        );
      }
      break;
    }
    recent.unshift(row);
    size += row.length + separator;
  }
  return recent.join("\n");
}

/** Build a small planning-only projection of summaries and recent visible conversation. */
export function collectPlannerContext(messages: Message[]): string {
  const rows = messages.flatMap((message) => {
    const row = toPlannerRow(message);
    return row ? [row] : [];
  });
  const visible = rows.filter((row) => row.kind === "visible").map((row) => row.text);
  const summaryBudget =
    visible.length > 0 ? MAX_SUMMARY_WITH_VISIBLE_CHARS : MAX_PLANNER_CONTEXT_CHARS;
  const summaries = takeRecentRows(
    rows.filter((row) => row.kind === "summary").map((row) => row.text),
    summaryBudget,
  );
  const separator = summaries && visible.length > 0 ? 1 : 0;
  const recent = takeRecentRows(visible, MAX_PLANNER_CONTEXT_CHARS - summaries.length - separator);
  return [summaries, recent].filter(Boolean).join("\n");
}
