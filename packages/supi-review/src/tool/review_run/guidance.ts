export const toolDescription =
  "Run independent inspection-only code reviews or repository-state audits against defined criteria in one frozen snapshot. Return structured findings, criteria coverage, and per-task verdicts. In TUI and RPC it runs in the background by default and returns a handle once the snapshot is frozen; after the Completion Notice, collect the report with agent_result instead of polling. Not for general repository exploration or implementation. review_run is unavailable inside codemode; call it only directly.";

export const promptSnippet = "Run independent inspection-only reviews";

export const promptGuidelines: string[] = [];
