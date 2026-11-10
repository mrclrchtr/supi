import { describe, expect, it } from "vitest";
import { analyze, classifyFollowUp, segmentsInWindow, sessionCalls } from "../code-tool-usage.mjs";

const orientation = {
  name: "code_orientation",
  text: "| `workflows/` | 3 |\n| `src/session/session.ts` | file |\nCaptured details: `/tmp/supi-orientation-x/snapshot.md`",
};
const read = (path) => ({ name: "read", arguments: { path } });

describe("classifyFollowUp", () => {
  it("separates followed results, descents, captured snapshots, and gaps", () => {
    expect(classifyFollowUp(orientation, read(".github/workflows/ci.yml"))).toBe("descend");
    expect(classifyFollowUp(orientation, read("packages/x/src/session/session.ts"))).toBe(
      "followed",
    );
    expect(classifyFollowUp(orientation, read("/tmp/supi-orientation-x/snapshot.md"))).toBe(
      "snapshot",
    );
    expect(classifyFollowUp(orientation, read("packages/x/README.md"))).toBe("gap");
    expect(classifyFollowUp(orientation, read("/abs/packages/x/src/session/session.ts"))).toBe(
      "followed",
    );
    expect(
      classifyFollowUp(orientation, { name: "bash", arguments: { command: "ls src/app" } }),
    ).toBe("gap");
  });

  it("does not count a bare shared file name as followed", () => {
    expect(classifyFollowUp({ name: "code_find", text: "`a/index.ts`" }, read("index.ts"))).toBe(
      "gap",
    );
  });

  it("classifies tool transitions without paths", () => {
    expect(classifyFollowUp(orientation, { name: "code_orientation", arguments: {} })).toBe(
      "retry",
    );
    expect(classifyFollowUp(orientation, { name: "code_graph", arguments: {} })).toBe("chain");
    expect(classifyFollowUp(orientation, { name: "edit", arguments: {} })).toBe("edit");
    expect(classifyFollowUp(orientation, undefined)).toBe("other");
  });
});

describe("analyze", () => {
  it("pairs persisted calls with results and compares effort before the first edit", () => {
    const toolCall = (id, name, args) => ({
      message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] },
    });
    const result = (id, name, text, details) => ({
      message: {
        role: "toolResult",
        toolCallId: id,
        toolName: name,
        content: [{ type: "text", text }],
        details,
      },
    });
    const withCode = sessionCalls([
      toolCall("1", "code_find", { query: "x" }),
      result("1", "code_find", "`src/a.ts`", { status: "completed" }),
      toolCall("2", "read", { path: "src/a.ts" }),
      result("2", "read", "body"),
      toolCall("3", "edit", {}),
      result("3", "edit", "ok"),
    ]);
    const withoutCode = sessionCalls([toolCall("4", "edit", {}), result("4", "edit", "ok")]);

    const report = analyze([withCode, withoutCode]);

    expect(report.tools.code_find).toMatchObject({
      calls: 1,
      status: { completed: 1 },
      followUp: { followed: 1 },
      argKeys: { query: 1 },
    });
    expect(report.beforeFirstEdit.withCode).toMatchObject({
      sessions: 1,
      medianCallsBeforeEdit: 2,
    });
    expect(report.beforeFirstEdit.withoutCode).toMatchObject({
      sessions: 1,
      medianCallsBeforeEdit: 0,
    });
  });
});

describe("segmentsInWindow", () => {
  const provenance = (commitTime) => ({
    type: "custom",
    customType: "supi-debug-event",
    data: { source: "supi-debug", category: "runtime-provenance", data: { commitTime } },
  });
  const call = (id, name) => [
    { message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: {} }] } },
    { message: { role: "toolResult", toolCallId: id, toolName: name, content: [] } },
  ];

  const entries = [
    ...call("0", "code_find"),
    provenance("2026-01-01T00:00:00Z"),
    ...call("1", "code_graph"),
    provenance("2026-02-01T00:00:00Z"),
    ...call("2", "code_resolve"),
  ];
  const names = (segments) => segments.map((calls) => calls.map((item) => item.name));
  const change = { commitTime: "2026-02-01T00:00:00Z" };

  it("splits at reloads and keeps segments on each side of a commit", () => {
    const coverage = { unknownProvenance: 0 };
    expect(names(segmentsInWindow(entries, { sinceCommit: change }, coverage))).toEqual([
      ["code_resolve"],
    ]);
    expect(names(segmentsInWindow(entries, { beforeCommit: change }, coverage))).toEqual([
      ["code_graph"],
    ]);
    expect(coverage.unknownProvenance).toBe(2);
  });
});
