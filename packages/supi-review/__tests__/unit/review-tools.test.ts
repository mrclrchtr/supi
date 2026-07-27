import { describe, expect, it } from "vitest";
import { createReviewTools } from "../../src/tool/review-tools.ts";
import type { ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree changes",
  changedFiles: ["a.txt"],
  diffText: "",
  stats: { files: 1, additions: 0, deletions: 0 },
};

describe("review tools", () => {
  it("exposes only the fixed target-aware protocol", () => {
    const tools = createReviewTools("/repo", snapshot, {});

    expect(tools.map((tool) => tool.name)).toEqual([
      "list_review_files",
      "read_review_diff",
      "read_review_file",
      "search_review_files",
      "submit_review",
    ]);
  });

  it("declares after as the default read side", () => {
    const tool = createReviewTools("/repo", snapshot, {}).find(
      (candidate) => candidate.name === "read_review_file",
    );
    const schema = tool?.parameters as unknown as {
      properties?: { side?: { default?: string } };
    };

    expect(schema.properties?.side?.default).toBe("after");
  });
});
