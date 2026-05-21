import { describe, expect, it } from "vitest";
import { buildBriefSynthesisPrompt } from "../../src/history/synthesize.ts";

const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts"],
  diffText: [
    "diff --git a/src/auth.ts b/src/auth.ts",
    "index aaa..bbb 100644",
    "--- a/src/auth.ts",
    "+++ b/src/auth.ts",
    "@@ -1,3 +1,4 @@",
    " export function auth() {",
    "+  return true;",
    " }",
  ].join("\n"),
  stats: { files: 1, additions: 1, deletions: 0 },
};

describe("brief synthesis prompt builder", () => {
  it("includes a bounded diff excerpt from the snapshot", () => {
    const prompt = buildBriefSynthesisPrompt(snapshot, [], "watch auth regressions");

    expect(prompt).toContain("### Diff excerpt");
    expect(prompt).toContain("diff --git a/src/auth.ts b/src/auth.ts");
    expect(prompt).toContain("+  return true;");
    expect(prompt).toContain("## User note");
  });
});
