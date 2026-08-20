export const toolDescription =
  "Report live diagnostics as observations, language-server status, and final semantic health state. Tracked-file snapshots do not prove workspace completeness; server inventory is workspace-wide.";

export const promptSnippet = "live workspace health observations";

export const promptGuidelines = [
  "Use code_health with refresh:true before relying on potentially stale diagnostics.",
];
