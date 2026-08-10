import { describe, expect, it } from "vitest";
import { buildReviewPacket } from "../../src/target/packet.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: {},
  target: { fromCommit: "a".repeat(40), toCommit: "a".repeat(40), includeUncommittedChanges: true },
  title: "Filesystem changes",
  changes: [{ status: "M", path: "a.ts", additions: 1, deletions: 1 }],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 1 },
};
const model = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;

describe("review instruction composition", () => {
  it("keeps Review Mode in the packet and finding policy in the Reviewer Protocol", () => {
    const task = { id: "task", instructions: "Check.", mode: "change" as const };
    const packet = buildReviewPacket(snapshot, { tasks: [task] }, {}, task, model).prompt;

    expect(packet).toContain("Review Mode: change");
    expect(packet).not.toContain("change-only");
    expect(packet).not.toContain("boy-scout");
    expect(packet).not.toContain("criteria-only");
  });
});
