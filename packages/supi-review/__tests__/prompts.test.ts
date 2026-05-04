import { describe, expect, it } from "vitest";
import { buildReviewPrompt } from "../src/prompts.ts";
import type { ReviewTarget } from "../src/types.ts";

// parseDiffStats is an export we're about to add — the import will fail until then.
// We use vi.fn() to capture it dynamically so we can test both the failed-import RED phase
// and the working GREEN phase from the same test structure.
const importParseDiffStats = async () => {
  const mod = await import("../src/prompts.ts");
  return mod.parseDiffStats;
};

const sampleDiff = [
  "diff --git a/src/file.ts b/src/file.ts",
  "index abc..def 100644",
  "--- a/src/file.ts",
  "+++ b/src/file.ts",
  "@@ -1,3 +1,4 @@",
  " line1",
  "-old line",
  "+new line",
  "+extra line",
].join("\n");

const twoFileDiff = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index a..b 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1,2 @@",
  " unchanged",
  "+new line",
  "diff --git a/src/b.ts b/src/b.ts",
  "index c..d 100644",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -1 +1 @@",
  "-gone",
  "+added",
].join("\n");

const sampleShow = [
  "commit abc123def456",
  "Author: Test User <test@example.com>",
  "Date:   Mon Jan 1 00:00:00 2024 +0000",
  "",
  "    Test commit message",
  "",
  "diff --git a/src/file.ts b/src/file.ts",
  "index abc..def 100644",
  "--- a/src/file.ts",
  "+++ b/src/file.ts",
  "@@ -1,3 +1,4 @@",
  " line1",
  "-old line",
  "+new line",
  "+extra line",
].join("\n");

describe("parseDiffStats", () => {
  it("counts files, additions, deductions from git diff", async () => {
    const parseDiffStats = await importParseDiffStats();
    const stats = parseDiffStats(sampleDiff);
    expect(stats).toEqual({ files: 1, additions: 2, deletions: 1 });
  });

  it("counts multiple files", async () => {
    const parseDiffStats = await importParseDiffStats();
    const stats = parseDiffStats(twoFileDiff);
    expect(stats).toEqual({ files: 2, additions: 2, deletions: 1 });
  });

  it("handles empty diff", async () => {
    const parseDiffStats = await importParseDiffStats();
    const stats = parseDiffStats("");
    expect(stats).toEqual({ files: 0, additions: 0, deletions: 0 });
  });

  it("parses stats from git show output (commit metadata before diff)", async () => {
    const parseDiffStats = await importParseDiffStats();
    const stats = parseDiffStats(sampleShow);
    expect(stats).toEqual({ files: 1, additions: 2, deletions: 1 });
  });
});

describe("buildReviewPrompt preamble with diff stats", () => {
  it("includes changes stats for base-branch target", () => {
    const target: ReviewTarget = { type: "base-branch", branch: "main", diff: sampleDiff };
    const result = buildReviewPrompt(target, sampleDiff);
    expect(result).toContain("**Changes:** +2 / -1 lines");
  });

  it("includes changes stats for uncommitted target", () => {
    const target: ReviewTarget = { type: "uncommitted", diff: sampleDiff };
    const result = buildReviewPrompt(target, sampleDiff);
    expect(result).toContain("**Changes:** +2 / -1 lines");
  });

  it("includes changes stats for commit target", () => {
    const target: ReviewTarget = { type: "commit", sha: "abc123", show: sampleShow };
    const result = buildReviewPrompt(target, sampleShow);
    expect(result).toContain("**Changes:** +2 / -1 lines");
  });

  it("does not include changes stats for custom target", () => {
    const target: ReviewTarget = { type: "custom", instructions: "test" };
    const result = buildReviewPrompt(target, "");
    expect(result).not.toContain("**Changes:**");
  });

  it("includes the diff block", () => {
    const target: ReviewTarget = { type: "uncommitted", diff: sampleDiff };
    const result = buildReviewPrompt(target, sampleDiff);
    expect(result).toContain("```diff");
    expect(result).toContain(sampleDiff);
  });

  it("includes truncated note when present", () => {
    const target: ReviewTarget = { type: "uncommitted", diff: sampleDiff };
    const result = buildReviewPrompt(target, sampleDiff, {
      truncated: true,
      truncatedBytes: 42,
    });
    expect(result).toContain("42 bytes omitted");
  });
});
