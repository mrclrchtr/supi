import type { ToolNamespace } from "@earendil-works/pi-coding-agent";

/** Codemode namespace shared by every `code_*` tool. */
export const CODE_TOOL_NAMESPACE: ToolNamespace = {
  name: "code",
  description:
    "Code-aware navigation, diagnostics, and refactoring through language servers and syntax trees.",
  instructions: [
    "Orient with code_orientation, discover with code_find, and pin exact targets with code_resolve.",
    "Pass returned target handles to code_inspect, code_graph, or code_refactor_plan instead of re-resolving names.",
    "Use code_health for diagnostics and language-server status.",
    "Refactors are two steps: code_refactor_plan previews edits without writing files; code_refactor_apply writes one stored planId.",
  ].join("\n"),
};
