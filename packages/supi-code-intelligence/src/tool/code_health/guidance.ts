export const toolDescription =
  "Report live diagnostics as observations, language-server route status, and final semantic health state. Tracked-file snapshots do not prove workspace completeness; server inventory and route issue counts are workspace-wide. Server-only calls are passive.";

export const promptSnippet = "live workspace health observations";

export const promptGuidelines = [
  "Use code_health with refresh:true before relying on potentially stale diagnostics; explicit refresh can recover crashed routes with tracked files in scope.",
];
