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

  it("does not include large inline diff bodies", () => {
    const packet = buildReviewPacket(snapshot, brief, model);
    expect(packet.includedFiles).toEqual([]);
    expect(packet.omittedFiles).toEqual(snapshot.changedFiles);
    expect(packet.charBudget).toBe(0);
    expect(packet.prompt).not.toContain("```diff");
  });

  it("mentions on-demand snapshot inspection", () => {
    const packet = buildReviewPacket(snapshot, brief, model);
    expect(packet.prompt).toContain("read_snapshot_diff");
    expect(packet.prompt).toContain("read_snapshot_file");
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
    expect(packet.prompt).toContain("skip — lockfile");
    expect(packet.prompt).toContain("skip — generated");
    expect(packet.prompt).toContain("skip — snapshot");
    expect(packet.prompt).toContain("skip — changelog");
    expect(packet.prompt).toContain("src/auth.ts");
  });
});

// biome-ignore lint/security/noSecrets: high-entropy string is a test label, not a secret
describe("classifySkipCategory", () => {
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

  it("categorizes minified files", () => {
    expect(classifySkipCategory("dist/bundle.min.js")).toBe("generated");
    expect(classifySkipCategory("public/style.min.css")).toBe("generated");
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

  it("extracts preamble before any diff sections", () => {
    const diff = [
      "=== Staged ===",
      "diff --git a/src/auth.ts b/src/auth.ts",
      "index aaa..bbb 100644",
      "--- a/src/auth.ts",
      "+++ b/src/auth.ts",
      "@@ -1,3 +1,4 @@",
      " export function auth() {",
      "+  return true;",
      " }",
    ].join("\n");

    const { preamble, sections } = splitDiffSections(diff);
    expect(preamble).toContain("=== Staged ===");
    expect(sections).toHaveLength(1);
  });

  it("handles renames without crashing", () => {
    const diff =
      "diff --git a/src/old.ts b/src/new.ts\nsimilarity index 100%\nrename from src/old.ts\nrename to src/new.ts"
        .split("\n")
        .join("\n");

    const { sections } = splitDiffSections(diff);
    // Renames produce a section with no +/- lines
    expect(sections).toHaveLength(1);
    expect(sections[0]?.file).toBe("src/new.ts");
    expect(sections[0]?.additions).toBe(0);
    expect(sections[0]?.deletions).toBe(0);
  });
});

describe("getPacketCharBudget", () => {
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
