import { describe, expect, it } from "vitest";
import { buildReviewPacket, getPacketCharBudget } from "../../src/target/packet.ts";
import type { ReviewModelSelection } from "../../src/types.ts";

const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts", "src/http.ts"],
  diffText: [
    "diff --git a/src/auth.ts b/src/auth.ts",
    "index aaa..bbb 100644",
    "--- a/src/auth.ts",
    "+++ b/src/auth.ts",
    "@@ -1,3 +1,4 @@",
    " export function auth() {",
    "+  return true;",
    " }",
    "diff --git a/src/http.ts b/src/http.ts",
    "index ccc..ddd 100644",
    "--- a/src/http.ts",
    "+++ b/src/http.ts",
    "@@ -1,3 +1,4 @@",
    " export function http() {",
    "+  return 200;",
    " }",
  ].join("\n"),
  stats: { files: 2, additions: 2, deletions: 0 },
};

const brief = {
  summary: "Refactor auth flow",
  intendedOutcome: "Preserve auth behavior while simplifying request handling",
  constraints: ["Keep public API stable"],
  focusAreas: ["Authentication logic", "Response handling"],
  riskyFiles: ["src/auth.ts"],
  unresolvedQuestions: ["Is anonymous access still allowed?"],
  evidenceCount: 3,
};

const model = {
  canonicalId: "anthropic/claude-sonnet-4",
  provider: "anthropic",
  id: "claude-sonnet-4",
  label: "Claude Sonnet 4",
  description: "anthropic/claude-sonnet-4",
  isCurrent: true,
  model: {
    provider: "anthropic",
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    reasoning: false,
    contextWindow: 200_000,
    api: {} as never,
    baseUrl: "",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    maxTokens: 8_000,
  },
} as unknown as ReviewModelSelection;

describe("buildReviewPacket", () => {
  it("includes the synthesized brief and changed-file manifest", () => {
    const packet = buildReviewPacket(snapshot, brief, model);
    expect(packet.prompt).toContain("## Session-derived intent");
    expect(packet.prompt).toContain("Refactor auth flow");
    expect(packet.prompt).toContain("## Changed files manifest");
    expect(packet.prompt).toContain("src/auth.ts");
    expect(packet.prompt).toContain("src/http.ts");
  });

  it("prioritizes risky files in the included diff list", () => {
    const packet = buildReviewPacket(snapshot, brief, model);
    expect(packet.includedFiles[0]).toBe("src/auth.ts");
  });

  it("derives a bounded packet budget from the model context window", () => {
    expect(getPacketCharBudget(model)).toBeGreaterThan(30_000);
    expect(getPacketCharBudget(model)).toBeLessThanOrEqual(128_000);
  });

  it("scales the packet budget down for smaller context windows", () => {
    const smallModel = {
      ...model,
      model: {
        ...model.model,
        contextWindow: 4_096,
      },
    } as ReviewModelSelection;

    expect(getPacketCharBudget(smallModel)).toBeLessThan(8_000);
  });
});
