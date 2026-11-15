export const toolDescription =
  "Report live diagnostics and language-server health. Use refresh:true when you need fresh diagnostic evidence; without it, diagnostics may be a tracked-file snapshot. Diagnostic snapshots do not prove that the whole workspace is clean; server inventory and route-status counts are always workspace-wide.";

export const promptSnippet = "check live diagnostics and language-server health";

export const promptGuidelines: string[] = [];

/** Next action for missing diagnostic evidence: file-level LSP check versus project-wide compiler check. */
export const DIAGNOSTIC_NEXT_ACTION =
  "for a file-level LSP check, call `code_health` with `scope` set to that file and `refresh: true`; for project-wide validation, run the project's own typecheck or build";
