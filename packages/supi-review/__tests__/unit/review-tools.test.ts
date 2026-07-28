import { describe, expect, it } from "vitest";
import { createReviewTools } from "../../src/tool/review-tools.ts";
import type { ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree changes",
  changes: [{ status: "M", path: "a.txt", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 0, deletions: 0 },
};

describe("review tools", () => {
  it("exposes only the fixed target-aware protocol", () => {
    const tools = createReviewTools("/repo", snapshot, {});

    expect(tools.map((tool) => tool.name)).toEqual([
      "list_review_changes",
      "list_review_files",
      "read_review_diff",
      "read_review_file",
      "search_review_files",
      "submit_review",
    ]);
  });

  it("renders status and numstat in the complete change inventory", async () => {
    const tool = createReviewTools("/repo", snapshot, {}).find(
      (candidate) => candidate.name === "list_review_changes",
    );
    const execute = tool?.execute as unknown as (
      id: string,
      args: Record<string, never>,
    ) => Promise<{ content: Array<{ text: string }> }>;

    const result = await execute("call-1", {});

    expect(result.content[0]?.text).toContain('M +1 -0 "a.txt"');
  });

  it("supports full diffs and composable line-range reads", () => {
    const tools = createReviewTools("/repo", snapshot, {});
    const diffSchema = tools.find((candidate) => candidate.name === "read_review_diff")
      ?.parameters as unknown as { required?: string[] };
    const fileSchema = tools.find((candidate) => candidate.name === "read_review_file")
      ?.parameters as unknown as {
      properties?: {
        side?: { default?: string };
        startLine?: { minimum?: number };
        lineCount?: { maximum?: number };
      };
    };

    expect(diffSchema.required ?? []).not.toContain("path");
    expect(fileSchema.properties?.side?.default).toBe("after");
    expect(fileSchema.properties?.startLine?.minimum).toBe(1);
    expect(fileSchema.properties?.lineCount?.maximum).toBeGreaterThan(1);
  });

  it("declares before/after and literal/regex search modes", () => {
    const tool = createReviewTools("/repo", snapshot, {}).find(
      (candidate) => candidate.name === "search_review_files",
    );
    const schema = tool?.parameters as unknown as {
      properties?: { side?: { default?: string }; mode?: { default?: string } };
    };

    expect(schema.properties?.side?.default).toBe("after");
    expect(schema.properties?.mode?.default).toBe("literal");
  });
});
