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

// biome-ignore lint/security/noSecrets: test string, not a secret
describe("buildBriefSynthesisPrompt", () => {
  it("includes a bounded diff excerpt from the snapshot", () => {
    const prompt = buildBriefSynthesisPrompt(snapshot, "", "watch auth regressions");

    expect(prompt).toContain("### Diff excerpt");
    expect(prompt).toContain("diff --git a/src/auth.ts b/src/auth.ts");
    expect(prompt).toContain("+  return true;");
    expect(prompt).toContain("## User note");
  });

  it("includes the serialized session context section", () => {
    const serializedContext =
      // biome-ignore lint/security/noSecrets: test string, not a secret
      "[User]\nRefactor auth module\n[Assistant]\nI'll inspect the changes.";
    const prompt = buildBriefSynthesisPrompt(snapshot, serializedContext);

    expect(prompt).toContain("## Serialized session context");
    expect(prompt).toContain("[User]");
    expect(prompt).toContain("Refactor auth module");
    expect(prompt).toContain("[Assistant]");
    expect(prompt).toContain("I'll inspect the changes.");
  });

  it("shows a fallback message when serialized context is empty", () => {
    const prompt = buildBriefSynthesisPrompt(snapshot, "");

    expect(prompt).toContain("## Serialized session context");
    expect(prompt).toContain("No session context");
    expect(prompt).not.toContain("[User]");
  });

  it("includes the output requirements section", () => {
    const prompt = buildBriefSynthesisPrompt(snapshot, "[User]\nTest message");

    expect(prompt).toContain("## Output requirements");
    expect(prompt).toContain("submit_review_brief");
  });
});
