import { describe, expect, it } from "vitest";
import { buildReviewPacket } from "../../src/target/packet.ts";
import { buildReviewerSystemPrompt } from "../../src/tool/review-system-prompt.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree changes",
  changes: [{ status: "M", path: "src/a.ts", additions: 1, deletions: 0 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;

describe("reviewer instruction composition", () => {
  it("keeps dynamic protocol policy out of the target packet", () => {
    const task = {
      id: "standards",
      instructions: "Apply the documented repository standards.",
      findingScope: "boy-scout" as const,
    };
    const packet = buildReviewPacket(snapshot, { tasks: [task] }, task, model).prompt;
    const configuredProtocol = buildReviewerSystemPrompt(true);
    const reviewerInstructions = `${configuredProtocol}\n${packet}`;

    expect(reviewerInstructions).not.toContain("Dependency Bootstrap");
    expect(packet).toContain("Finding Scope: boy-scout");
    expect(packet).not.toMatch(/Do not run tests|submit_review exactly once/i);
    expect(configuredProtocol).toMatch(/Review Criteria/i);
    expect(configuredProtocol).toMatch(/change-only.*boy-scout/is);
    expect(configuredProtocol).toMatch(/rejected.*correct.*retry/is);
    expect(buildReviewerSystemPrompt()).toContain("optional Dependency Bootstrap");
  });
});
