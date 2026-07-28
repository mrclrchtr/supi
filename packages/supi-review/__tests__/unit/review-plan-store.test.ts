import { describe, expect, it } from "vitest";
import { ReviewPlanStore } from "../../src/session/review-plan-store.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../../src/types.ts";

const snapshot: ReviewSnapshot = {
  repositoryRoot: "/repo",
  requestedTarget: { kind: "working-tree" },
  target: { kind: "working-tree", headCommit: "a".repeat(40) },
  title: "Working tree",
  changedFiles: ["a.ts"],
  diffHash: "b".repeat(64),
  stats: { files: 1, additions: 1, deletions: 0 },
};
const reviewerModel = { canonicalId: "provider/model", model: {} } as ReviewModelSelection;

describe("ReviewPlanStore bounds", () => {
  it("expires old available plans without expiring running leases", () => {
    let now = 0;
    const store = new ReviewPlanStore({ maxAgeMs: 10, now: () => now });
    const available = store.create({ snapshot, reviewerModel });
    const running = store.create({ snapshot, reviewerModel });
    const lease = store.acquire(running.id);
    expect(lease).toBeDefined();

    now = 11;
    expect(store.peek(available.id)).toBeUndefined();
    expect(lease && store.release(lease)).toBe(true);
    expect(store.peek(running.id)).toBeDefined();
  });

  it("evicts the oldest available plan at the count bound", () => {
    const store = new ReviewPlanStore({ maxPlans: 1 });
    const first = store.create({ snapshot, reviewerModel });
    const second = store.create({ snapshot, reviewerModel });

    expect(store.peek(first.id)).toBeUndefined();
    expect(store.peek(second.id)).toBeDefined();
  });
});
