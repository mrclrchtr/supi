export const toolDescription =
  "Report live diagnostics and language-server health. Diagnostic snapshots do not prove that the whole workspace is clean; server inventory and route-status counts are always workspace-wide.";

export const promptSnippet = "check live diagnostics and language-server health";

export const promptGuidelines = [
  "Use code_health with `refresh: true` before relying on diagnostics that can be stale.",
];
