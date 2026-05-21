import type { SessionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { collectHistoryEvidence } from "../../src/history/collect.ts";

const snapshot = {
  target: { kind: "working-tree" as const },
  title: "Working tree changes",
  changedFiles: ["src/auth.ts", "src/http.ts"],
  diffText: "",
  stats: { files: 2, additions: 0, deletions: 0 },
};

type ResolvedSessionMessage = SessionContext["messages"][number];

function makeMessage(role: "user" | "assistant", content: string): ResolvedSessionMessage {
  return { role, content } as ResolvedSessionMessage;
}

describe("collectHistoryEvidence", () => {
  it("prefers intent-bearing user context that mentions changed files", () => {
    const evidence = collectHistoryEvidence(
      [
        makeMessage("assistant", "I'll inspect the repo."),
        makeMessage(
          "user",
          "Refactor src/auth.ts but preserve the public API and keep error handling unchanged.",
        ),
      ],
      snapshot,
    );

    expect(evidence[0]?.kind).toBe("user");
    expect(evidence[0]?.reason).toContain("changed-path token");
  });

  it("keeps compaction summaries as evidence", () => {
    const evidence = collectHistoryEvidence(
      [
        {
          role: "compactionSummary",
          summary: "User wanted to preserve auth semantics while simplifying the middleware.",
          tokensBefore: 1000,
          timestamp: Date.now(),
        } as ResolvedSessionMessage,
      ],
      snapshot,
      "watch for auth regressions",
    );

    expect(evidence[0]?.kind).toBe("compaction");
    expect(evidence[0]?.text).toContain("preserve auth semantics");
  });
});
