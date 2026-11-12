import type { ToolNamespace } from "@earendil-works/pi-coding-agent";

/** Codemode namespace shared by the script-callable Review tools. */
export const REVIEW_TOOL_NAMESPACE: ToolNamespace = {
  name: "review",
  description: "Read Review reports and reviewer replays produced by review_run or /supi-review.",
  instructions: [
    "review_output reads a report artifact by the artifactId that review_run or /supi-review returned.",
    "review_audit lists local reviewer replays; start with the Replay Outline before message or raw views.",
  ].join("\n"),
};
