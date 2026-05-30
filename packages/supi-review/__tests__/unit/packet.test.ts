import { describe, expect, it } from "vitest";
import {
  buildReviewPacket,
  buildReviewPacketPreviewData,
  classifySkipCategory,
  getPacketCharBudget,
  splitDiffSections,
} from "../../src/target/packet.ts";
import type {
  ReviewModelSelection,
  ReviewSnapshot,
  SynthesizedReviewBrief,
} from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  target: { kind: "working-tree" },
  title: "Working tree changes",
  changedFiles: ["packages/supi-code-intelligence/src/tool/tool-specs.ts"],
  diffText:
    'diff --git a/packages/supi-code-intelligence/src/tool/tool-specs.ts b/packages/supi-code-intelligence/src/tool/tool-specs.ts\n- "code_calls"\n+ "code_graph"',
  stats: { files: 1, additions: 1, deletions: 1 },
};

const brief: SynthesizedReviewBrief = {
  summary: "Merge relation tools into a single public surface.",
  intendedOutcome: "Replace stale public tool names with one unified graph tool.",
  constraints: ["Keep the packet compact."],
  focusAreas: ["Tool names", "Docs", "User-facing strings"],
  riskyFiles: ["packages/supi-code-intelligence/src/tool/tool-specs.ts"],
  unresolvedQuestions: [],
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

describe("buildReviewPacketPreviewData", () => {
  it("derives structured overview data for the review-plan inspector", () => {
    const longNotes = `=== Snapshot notes ===\n${"review context ".repeat(140)}`;
    const preview = buildReviewPacketPreviewData({
      target: { kind: "working-tree" },
      title: "Working tree changes",
      changedFiles: ["packages/supi-code-intelligence/src/tool/tool-specs.ts", "pnpm-lock.yaml"],
      diffText: [
        longNotes,
        "diff --git a/packages/supi-code-intelligence/src/tool/tool-specs.ts b/packages/supi-code-intelligence/src/tool/tool-specs.ts",
        "--- a/packages/supi-code-intelligence/src/tool/tool-specs.ts",
        "+++ b/packages/supi-code-intelligence/src/tool/tool-specs.ts",
        "@@ -1 +1 @@",
        '- "code_calls"',
        '+ "code_graph"',
      ].join("\n"),
      stats: { files: 2, additions: 1, deletions: 1 },
    });

    expect(preview.auditHints).toHaveLength(1);
    expect(preview.auditHints[0]?.title).toBe("Public-surface / rename / merge audit");
    expect(preview.fileOverview).toEqual([
      {
        file: "packages/supi-code-intelligence/src/tool/tool-specs.ts",
        additions: 1,
        deletions: 1,
        annotations: ["trivial"],
      },
      {
        file: "pnpm-lock.yaml",
        additions: null,
        deletions: null,
        annotations: ["skip — lockfile"],
      },
    ]);
    expect(preview.snapshotNotes).toContain("=== Snapshot notes ===");
    expect(preview.snapshotNotes).toContain("[... truncated ...]");
  });
});

describe("buildReviewPacket", () => {
  it("includes a concise audit-hints section in the review packet", () => {
    const packet = buildReviewPacket(snapshot, brief, model);

    expect(packet.prompt).toContain("## Audit hints");
    expect(packet.prompt).toContain("Public-surface / rename / merge audit");
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
