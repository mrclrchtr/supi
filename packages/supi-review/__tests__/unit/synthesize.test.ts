import { describe, expect, it } from "vitest";
import { buildBriefSynthesisPrompt } from "../../src/history/synthesize.ts";
import type { ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  target: { kind: "working-tree" },
  title: "Working tree changes",
  changedFiles: ["packages/supi-review/src/history/synthesize.ts"],
  diffText:
    "diff --git a/packages/supi-review/src/history/synthesize.ts b/packages/supi-review/src/history/synthesize.ts\n+ ## Available review instruction blocks",
  stats: { files: 1, additions: 1, deletions: 0 },
};

// biome-ignore lint/security/noSecrets: high-entropy string is a test label, not a secret
describe("buildBriefSynthesisPrompt", () => {
  it("includes the instruction block catalog and selection guidance", () => {
    const prompt = buildBriefSynthesisPrompt(snapshot, "[User]\nPlease simplify prompt building.");

    expect(prompt).toContain("## Available review instruction blocks");
    expect(prompt).toContain("- public-surface:");
    expect(prompt).toContain("- cross-layer:");
    expect(prompt).toContain("- schema-widening:");
    expect(prompt).toContain("- cleanup:");
    expect(prompt).toContain("- reviewInstructionBlockIds: zero or more IDs");
    expect(prompt).toContain("Prefer omission over guessing. Do not invent new IDs.");
  });
});
