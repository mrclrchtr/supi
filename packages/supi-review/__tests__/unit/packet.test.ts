import { describe, expect, it } from "vitest";
import {
  buildReviewPacket,
  classifySkipCategory,
  getPacketCharBudget,
  splitDiffSections,
} from "../../src/target/packet.ts";
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

describe("splitDiffSections", () => {
  it("counts additions and deletions per diff section", () => {
    const diff = [
      "diff --git a/src/auth.ts b/src/auth.ts",
      "index aaa..bbb 100644",
      "--- a/src/auth.ts",
      "+++ b/src/auth.ts",
      "@@ -1,3 +1,4 @@",
      " export function auth() {",
      "+  return true;",
      "+  console.log('auth');",
      " }",
      "diff --git a/src/http.ts b/src/http.ts",
      "index ccc..ddd 100644",
      "--- a/src/http.ts",
      "+++ b/src/http.ts",
      "@@ -1,3 +1,4 @@",
      " export function http() {",
      "-  return null;",
      "+  return 200;",
      " }",
      "diff --git a/src/db.ts b/src/db.ts",
      "index eee..fff 100644",
      "--- a/src/db.ts",
      "+++ b/src/db.ts",
      "@@ -10,7 +10,7 @@",
      "   // unchanged context",
      "-  oldMethod();",
      "+  newMethod();",
      "+",
      "+",
      "   // more context",
      " ]",
    ].join("\n");

    const { sections } = splitDiffSections(diff);

    expect(sections).toHaveLength(3);

    const auth = sections.find((s) => s.file === "src/auth.ts");
    expect(auth?.additions).toBe(2);
    expect(auth?.deletions).toBe(0);

    const http = sections.find((s) => s.file === "src/http.ts");
    expect(http?.additions).toBe(1);
    expect(http?.deletions).toBe(1);

    const db = sections.find((s) => s.file === "src/db.ts");
    expect(db?.additions).toBe(3);
    expect(db?.deletions).toBe(1);
  });

  it("includes a file overview table with per-file stats", () => {
    const packet = buildReviewPacket(snapshot, brief, model);
    expect(packet.prompt).toContain("## File overview");
    expect(packet.prompt).toContain("src/auth.ts");
    expect(packet.prompt).toContain("src/http.ts");
  });

  it("marks trivial files in file overview", () => {
    const bigSnapshot = {
      ...snapshot,
      stats: { files: 2, additions: 12, deletions: 2 },
      changedFiles: ["src/auth.ts", "src/http.ts", "src/trivial.ts"],
      diffText: [
        "diff --git a/src/auth.ts b/src/auth.ts",
        "index aaa..bbb 100644",
        "--- a/src/auth.ts",
        "+++ b/src/auth.ts",
        "@@ -1,3 +1,4 @@",
        " export function auth() {",
        "+  return true;",
        "+  console.log('auth');",
        " }",
        "diff --git a/src/http.ts b/src/http.ts",
        "index ccc..ddd 100644",
        "--- a/src/http.ts",
        "+++ b/src/http.ts",
        "@@ -1,3 +1,4 @@",
        " export function http() {",
        "-  return null;",
        "+  return 200;",
        "+  console.log('http');",
        " }",
        "diff --git a/src/trivial.ts b/src/trivial.ts",
        "index ggg..hhh 100644",
        "--- a/src/trivial.ts",
        "+++ b/src/trivial.ts",
        "@@ -1,1 +1,1 @@",
        "-old_name",
        "+new_name",
      ].join("\n"),
    };

    const packet = buildReviewPacket(bigSnapshot, brief, model);
    expect(packet.prompt).toContain("trivial");
  });

  it("annotates skip-list files with category tags in file overview", () => {
    const skipSnapshot = {
      ...snapshot,
      changedFiles: [
        "src/auth.ts",
        "package-lock.json",
        "dist/bundle.js",
        "__snapshots__/test.ts.snap",
        "CHANGELOG.md",
      ],
      diffText: [
        "diff --git a/src/auth.ts b/src/auth.ts",
        "index aaa..bbb 100644",
        "--- a/src/auth.ts",
        "+++ b/src/auth.ts",
        "@@ -1,3 +1,4 @@",
        " export function auth() {",
        "+  return true;",
        " }",
        "diff --git a/package-lock.json b/package-lock.json",
        "index ccc..ddd 100644",
        "--- a/package-lock.json",
        "+++ b/package-lock.json",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
        "diff --git a/dist/bundle.js b/dist/bundle.js",
        "index eee..fff 100644",
        "--- a/dist/bundle.js",
        "+++ b/dist/bundle.js",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
        "diff --git a/__snapshots__/test.ts.snap b/__snapshots__/test.ts.snap",
        "index ggg..hhh 100644",
        "--- a/__snapshots__/test.ts.snap",
        "+++ b/__snapshots__/test.ts.snap",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
        "diff --git a/CHANGELOG.md b/CHANGELOG.md",
        "index iii..jjj 100644",
        "--- a/CHANGELOG.md",
        "+++ b/CHANGELOG.md",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
      ].join("\n"),
    };

    const packet = buildReviewPacket(skipSnapshot, brief, model);
    // Skip-list files get category annotations in the table
    expect(packet.prompt).toContain("skip — lockfile");
    expect(packet.prompt).toContain("skip — generated");
    expect(packet.prompt).toContain("skip — snapshot");
    expect(packet.prompt).toContain("skip — changelog");
    // Non-skip-list file still appears without annotation
    expect(packet.prompt).toContain("src/auth.ts");
  });

  it("detects source files as not skip-worthy", () => {
    expect(classifySkipCategory("src/auth.ts")).toBeUndefined();
    expect(classifySkipCategory("src/utils/helpers.ts")).toBeUndefined();
    expect(classifySkipCategory("__tests__/unit/auth.test.ts")).toBeUndefined();
    expect(classifySkipCategory("packages/supi-review/src/types.ts")).toBeUndefined();
  });

  it("categorizes lockfiles", () => {
    expect(classifySkipCategory("package-lock.json")).toBe("lockfile");
    expect(classifySkipCategory("yarn.lock")).toBe("lockfile");
    expect(classifySkipCategory("pnpm-lock.yaml")).toBe("lockfile");
    expect(classifySkipCategory("Gemfile.lock")).toBe("lockfile");
    expect(classifySkipCategory("Cargo.lock")).toBe("lockfile");
    expect(classifySkipCategory("poetry.lock")).toBe("lockfile");
    expect(classifySkipCategory("composer.lock")).toBe("lockfile");
    // Lockfiles in subdirectories are detected by basename
    expect(classifySkipCategory("packages/foo/package-lock.json")).toBe("lockfile");
    expect(classifySkipCategory("vendor/yarn.lock")).toBe("lockfile");
  });

  it("categorizes changelogs", () => {
    expect(classifySkipCategory("CHANGELOG.md")).toBe("changelog");
    expect(classifySkipCategory("packages/foo/CHANGELOG.md")).toBe("changelog");
    expect(classifySkipCategory("CHANGES.txt")).toBe("changelog");
  });

  it("categorizes generated files", () => {
    expect(classifySkipCategory("dist/bundle.js")).toBe("generated");
    expect(classifySkipCategory("build/output.o")).toBe("generated");
    expect(classifySkipCategory(".next/server.js")).toBe("generated");
    expect(classifySkipCategory("src/__generated__/types.ts")).toBe("generated");
  });

  it("categorizes snapshots", () => {
    expect(classifySkipCategory("__snapshots__/test.ts.snap")).toBe("snapshot");
    expect(classifySkipCategory("src/components/__snapshots__/button.test.ts.snap")).toBe(
      "snapshot",
    );
    expect(classifySkipCategory("src/snapshots/foo.snap")).toBe("snapshot");
  });

  it("categorizes vendored code", () => {
    expect(classifySkipCategory("vendor/foo.js")).toBe("vendored");
    expect(classifySkipCategory("third_party/bar.cc")).toBe("vendored");
    expect(classifySkipCategory("src/vendor/hack.ts")).toBe("vendored");
  });

  it("accumulates stats for the same file across staged and unstaged sections", () => {
    const stagedUnstagedSnapshot = {
      ...snapshot,
      changedFiles: ["src/a.ts"],
      diffText: [
        "=== Staged ===",
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1,2 @@",
        " base",
        "+  staged_add",
        "=== Unstaged ===",
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1,2 +1,3 @@",
        " base",
        "-  old_line",
        "+  new_line",
      ].join("\n"),
    };

    const packet = buildReviewPacket(stagedUnstagedSnapshot, brief, model);
    // The overview table should show accumulated stats (2 additions, 1 deletion)
    const table = packet.prompt.match(/## File overview[\s\S]*?(?=\n## |$)/)?.[0] ?? "";
    expect(table).toContain("| src/a.ts | 2 | 1");
    expect(table).not.toContain("| src/a.ts | 1 | 0");
    expect(table).not.toContain("| src/a.ts | 1 | 1");
  });

  it("shows unknown stats for files without diff sections", () => {
    const untrackedSnapshot = {
      ...snapshot,
      changedFiles: ["src/a.ts", "untracked/new.ts"],
      diffText: [
        "=== Staged ===",
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1,2 @@",
        " base",
        "+  staged_add",
        "=== Untracked files ===",
        "untracked/new.ts",
      ].join("\n"),
    };

    const packet = buildReviewPacket(untrackedSnapshot, brief, model);
    expect(packet.prompt).toContain("untracked/new.ts");
    // Untracked file shows ?/? instead of 0/0 and does NOT get trivial annotation
    const tableSection = packet.prompt.match(/## File overview[\s\S]*?(?=\n## |$)/)?.[0] ?? "";
    expect(tableSection).toContain("untracked/new.ts");
    // The ?/? row for the untracked file should not contain "trivial"
    const untrackedRow = tableSection.split("\n").find((line) => line.includes("untracked/new.ts"));
    expect(untrackedRow).toContain("| ? | ?");
    expect(untrackedRow).not.toContain("trivial");
  });

  it("detects skip-only extract from raw prompt (not just table)", () => {
    // Verify the skip annotation does NOT appear for normal source files in a clean diff
    const cleanPacket = buildReviewPacket(snapshot, brief, model);
    expect(cleanPacket.prompt).not.toContain("skip —");
  });

  it("extracts preamble before any diff sections", () => {
    const diff = [
      "Some note about the diff",
      "Or a commit message",
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");

    const { preamble } = splitDiffSections(diff);
    expect(preamble).toContain("Some note about the diff");
    expect(preamble).toContain("commit message");
  });
});
