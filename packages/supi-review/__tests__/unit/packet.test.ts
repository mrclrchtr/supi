import { describe, expect, it } from "vitest";
import { buildReviewPacket, REVIEW_PACKET_PROTOCOL_VERSION } from "../../src/target/packet.ts";
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
const model = {
  canonicalId: "provider/model",
  model: { contextWindow: 100_000 },
} as ReviewModelSelection;

describe("buildReviewPacket", () => {
  it("combines caller policy with engine-owned target and protocol guidance", () => {
    const task = { id: "spec", instructions: "Check requirement R1." };
    const packet = buildReviewPacket(
      snapshot,
      { sharedContext: "Issue #1", tasks: [task] },
      task,
      model,
    );

    expect(packet.prompt).toContain("Issue #1");
    expect(packet.prompt).toContain("Check requirement R1.");
    expect(packet.prompt).toContain("git diff HEAD");
    expect(packet.prompt).toContain("Finding Scope: change-only");
    expect(packet.prompt).not.toContain("code_orientation");
    expect(packet.prompt).not.toContain("read_review_diff");
    expect(packet.prompt).toContain('M +1 -0 "src/a.ts"');
    expect(packet.prompt).toContain(`Protocol version: ${REVIEW_PACKET_PROTOCOL_VERSION}`);
    expect(packet.prompt).toContain("a".repeat(40));
    expect(packet.prompt).not.toContain("+change");
    expect(packet.packetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("bounds the embedded changed-file manifest and points to complete paging", () => {
    const large = {
      ...snapshot,
      changes: Array.from({ length: 1_000 }, (_, index) => ({
        status: "M",
        path: `src/${index}-${"x".repeat(100)}.ts`,
        additions: 1,
        deletions: 0,
      })),
    };
    const task = { id: "scale", instructions: "Review the complete target." };

    const packet = buildReviewPacket(large, { tasks: [task] }, task, model);
    const manifest = packet.prompt.split("## Changed files\n")[1]?.split("\n\n## Inspection")[0];

    expect(manifest?.length).toBeLessThanOrEqual(8_000);
    expect(manifest).toContain("additional change(s) omitted");
    expect(packet.prompt).toContain("git diff HEAD");
  });

  it("reproduces exact packet bytes and hash for equivalent inputs", () => {
    const task = { id: "standards", instructions: "Check standards." };
    const review = { sharedContext: "Context", tasks: [task] };

    expect(buildReviewPacket(snapshot, review, task, model)).toEqual(
      buildReviewPacket(snapshot, review, task, model),
    );
  });

  it("changes the packet hash when the target diff changes without embedding the diff", () => {
    const task = { id: "spec", instructions: "Check behavior." };
    const review = { tasks: [task] };
    const changedSnapshot = { ...snapshot, diffHash: "c".repeat(64) };

    const first = buildReviewPacket(snapshot, review, task, model);
    const second = buildReviewPacket(changedSnapshot, review, task, model);

    expect(second.packetHash).not.toBe(first.packetHash);
    expect(second.prompt).not.toContain("+different");
  });
});
