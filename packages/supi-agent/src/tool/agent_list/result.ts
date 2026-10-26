import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

/** One saved conversation row prepared by the list workflow. */
export interface AgentListRow {
  readonly conversationId: string;
  readonly label: string;
  readonly profileId: string;
  readonly status: "available" | "busy" | "pending-collection" | "unavailable";
  readonly reason?: string;
  readonly activity?: "busy" | "pending-collection";
}

/** Assemble the bounded public result for one page of saved conversations. */
export function buildAgentListResult(options: {
  readonly rows: readonly AgentListRow[];
  readonly offset: number;
  readonly limit: number;
}): AgentToolResult<Record<string, unknown>> {
  const page = options.rows.slice(options.offset, options.offset + options.limit).map(sanitizeRow);
  const content = page.length
    ? `Agent Conversations ${options.offset + 1}-${options.offset + page.length} of ${options.rows.length}:\n${page.map(formatRow).join("\n")}`
    : options.rows.length === 0
      ? "No saved Agent Conversations on this branch."
      : `No Agent Conversations at offset ${options.offset}; ${options.rows.length} total.`;
  return {
    content: [
      {
        type: "text",
        text: content,
      },
    ],
    details: {
      offset: options.offset,
      limit: options.limit,
      total: options.rows.length,
      rows: page,
    },
  };
}

function sanitizeRow(row: AgentListRow): AgentListRow {
  return {
    ...row,
    label: safeLabel(row.label),
    profileId: safeLabel(row.profileId),
  };
}

function formatRow(row: AgentListRow): string {
  const reason = row.reason ? ` — ${row.reason}` : "";
  return `${row.conversationId} · ${row.label} · ${row.profileId} · ${row.status}${reason}`;
}

function safeLabel(value: string | undefined): string {
  if (!value) return "(unavailable)";
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return normalized.length <= 64 ? normalized : `${normalized.slice(0, 63)}…`;
}
