import { describe, expect, it } from "vitest";
import {
  analyzeOpportunities,
  classifySearch,
  fullReadsBeforeEdit,
  searchesOf,
} from "../code-tool-opportunities.mjs";
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

describe("missed opportunities", () => {
  const bash = (command) => ({ name: "bash", arguments: { command }, text: "" });
  const categories = (command) => searchesOf(bash(command)).map(classifySearch);

  it("classifies symbol searches by the question they ask", () => {
    expect(categories("rg -n 'startDetectedServers' packages -g '*.ts' | head -20")).toEqual([
      "references",
    ]);
    expect(categories('rg -n "\\bregisterSettings\\(" packages')).toEqual(["references"]);
    expect(categories('rg -n "ReferenceEntry|ImplementationEntry" src')).toEqual(["references"]);
    expect(categories('rg -n "export async function startDetectedServers" src')).toEqual([
      "declaration",
    ]);
    expect(categories('grep -rn "implements SettingsModule" packages')).toEqual([
      "implementations",
    ]);
    expect(
      classifySearch(
        searchesOf({ name: "grep", arguments: { pattern: "class \\w+ extends BaseClient" } })[0],
      ),
    ).toBe("implementations");
  });

  it("ignores text questions and filters over command output", () => {
    expect(categories('rg -n -i "warmUp" packages')).toEqual([null]);
    expect(categories('rg -n "registerSettings" README.md docs/a.md')).toEqual([null]);
    expect(categories('rg -n "error|fail" src')).toEqual([null]);
    expect(categories('rg -n "settings" src')).toEqual([null]);
    expect(categories("pnpm test 2>&1 | rg 'registerSettings'")).toEqual([]);
    expect(categories("rg --files -g '*.ts' | head")).toEqual([]);
    expect(categories("echo 'rg registerSettings'")).toEqual([]);
  });

  it("reads the pattern past value flags and separates chained commands", () => {
    expect(
      searchesOf(bash("rg -n -g '!**/__tests__/**' -A 3 fooBar src; rg -e bazQux || true")),
    ).toMatchObject([
      { pattern: "fooBar", paths: ["src"] },
      { pattern: "bazQux", paths: [] },
    ]);
  });

  it("pairs whole-file source reads with the next edit of that file", () => {
    const body = Array.from({ length: 200 }, (_, line) => `line ${line}`).join("\n");
    const read = (path, extra) => ({ name: "read", arguments: { path, ...extra }, text: body });
    const edit = (path) => ({
      name: "edit",
      arguments: { path, edits: [{ oldText: "a\nb\nc", newText: "d" }] },
      text: "",
    });

    expect(fullReadsBeforeEdit([read("./src/a.ts"), edit("src/a.ts"), edit("src/a.ts")])).toEqual([
      { linesRead: 200, linesEdited: 3 },
    ]);
    expect(fullReadsBeforeEdit([read("src/a.ts", { offset: 40 }), edit("src/a.ts")])).toEqual([]);
    expect(fullReadsBeforeEdit([read("docs/a.md"), edit("docs/a.md")])).toEqual([]);
    expect(fullReadsBeforeEdit([read("src/a.ts"), edit("src/b.ts")])).toEqual([]);
  });

  it("counts native searches next to code_* calls of the same kind", () => {
    const graph = (relations) => ({ name: "code_graph", arguments: { relations }, text: "" });
    const report = analyzeOpportunities([
      [bash("rg -n fooBar src"), bash("rg -n fooBar src"), graph(undefined)],
      [bash("rg -n bazQux src"), graph(["implements"])],
    ]);

    expect(report.searches.references).toMatchObject({
      native: 3,
      nativeSessions: 2,
      codeTool: 1,
      topPatterns: [
        { pattern: "fooBar", count: 2 },
        { pattern: "bazQux", count: 1 },
      ],
    });
    expect(report.searches.implementations).toMatchObject({ native: 0, codeTool: 1 });
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
