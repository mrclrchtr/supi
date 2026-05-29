import { describe, expect, it } from "vitest";
import { deriveAuditHints } from "../../src/target/audit-hints.ts";
import type { ReviewSnapshot } from "../../src/types.ts";

function createSnapshot(overrides: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    target: { kind: "working-tree" },
    title: "Working tree changes",
    changedFiles: ["src/auth.ts"],
    diffText: "diff --git a/src/auth.ts b/src/auth.ts",
    stats: { files: 1, additions: 1, deletions: 0 },
    ...overrides,
  };
}

describe("deriveAuditHints", () => {
  it("adds a public-surface audit for renamed or merged public tool files", () => {
    const hints = deriveAuditHints(
      createSnapshot({
        changedFiles: [
          "packages/supi-code-intelligence/src/tool/tool-specs.ts",
          "packages/supi-code-intelligence/src/intent/types.ts",
        ],
        diffText:
          'diff --git a/packages/supi-code-intelligence/src/tool/tool-specs.ts b/packages/supi-code-intelligence/src/tool/tool-specs.ts\n- "code_calls"\n+ "code_graph"',
      }),
    );

    expect(hints.map((hint: { kind: string }) => hint.kind)).toContain("public-surface");
  });

  it("adds a cross-layer audit when the change spans runtime, orchestration, presentation, and tests", () => {
    const hints = deriveAuditHints(
      createSnapshot({
        changedFiles: [
          "packages/supi-code-runtime/src/types.ts",
          "packages/supi-lsp/src/provider/lsp-semantic-provider.ts",
          "packages/supi-code-intelligence/src/use-case/generate-brief.ts",
          "packages/supi-code-intelligence/src/presentation/markdown/brief.ts",
          "packages/supi-code-intelligence/__tests__/unit/anchored-brief.test.ts",
        ],
      }),
    );

    expect(hints.map((hint: { kind: string }) => hint.kind)).toContain("cross-layer");
  });

  it("adds an enum/schema widening audit when types and schemas expand together", () => {
    const hints = deriveAuditHints(
      createSnapshot({
        changedFiles: [
          "packages/supi-review/src/types.ts",
          "packages/supi-review/src/tool/schemas.ts",
          "packages/supi-review/src/tool/review-runner.ts",
        ],
        diffText:
          'diff --git a/packages/supi-review/src/types.ts b/packages/supi-review/src/types.ts\n+ export type ReviewItemRecommendedAction = "must-fix" | "should-fix" | "consider";',
      }),
    );

    expect(hints.map((hint: { kind: string }) => hint.kind)).toContain("schema-widening");
  });

  it("adds a cleanup audit when files are deleted or orphan cleanup is likely", () => {
    const hints = deriveAuditHints(
      createSnapshot({
        changedFiles: [
          "packages/supi-code-intelligence/src/tool/execute-calls.ts",
          "packages/supi-code-intelligence/src/tool/execute-implementations.ts",
        ],
        diffText:
          "diff --git a/packages/supi-code-intelligence/src/tool/execute-calls.ts b/packages/supi-code-intelligence/src/tool/execute-calls.ts\ndeleted file mode 100644",
      }),
    );

    expect(hints.map((hint: { kind: string }) => hint.kind)).toContain("cleanup");
  });
});
