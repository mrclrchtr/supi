import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const script = new URL("../../skills/session-analytics/scripts/export.mjs", import.meta.url);
let root: string;
let sessions: string;
let workspace: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "supi-session-analytics-"));
  // Spaces in both storage and workspace paths broke the ad-hoc `xargs` pipelines.
  sessions = join(root, "session storage");
  workspace = join(root, "my project");
  await Promise.all([mkdir(sessions), mkdir(join(workspace, "pkg"), { recursive: true })]);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

let clock = Date.parse("2026-11-01T10:00:00Z");
function at() {
  clock += 1000;
  return new Date(clock).toISOString();
}

function system(added: string[], removed: string[] = []) {
  return {
    type: "message",
    timestamp: at(),
    message: {
      role: "system",
      content: "",
      toolsAdded: added.map((name) => ({ name, description: "", parameters: {} })),
      ...(removed.length ? { toolsRemoved: removed.map((name) => ({ name })) } : {}),
    },
  };
}

function call(id: string, name: string, args: Record<string, unknown>) {
  return {
    type: "message",
    timestamp: at(),
    message: {
      role: "assistant",
      model: "test-model",
      content: [{ type: "toolCall", id, name, arguments: args }],
    },
  };
}

function result(id: string, name: string, text: string, isError = false) {
  return {
    type: "message",
    timestamp: at(),
    message: {
      role: "toolResult",
      toolCallId: id,
      toolName: name,
      content: [{ type: "text", text }],
      isError,
    },
  };
}

function debugEvent(source: string, level: string, category: string, timestamp: number) {
  return {
    type: "custom",
    customType: "supi-debug-event",
    data: { id: 1, timestamp, source, level, category, message: "m", data: { payload: "SECRET" } },
  };
}

async function session(name: string, cwd: string, entries: unknown[]) {
  const path = join(sessions, name);
  await mkdir(dirname(path), { recursive: true });
  const lines = [{ type: "session", version: 3, id: name, cwd }, ...entries];
  await writeFile(path, lines.map((entry) => JSON.stringify(entry)).join("\n"));
  return lines.map((entry) => JSON.stringify(entry));
}

async function exportKind(kind: string, args: string[] = []) {
  const output = join(root, `${kind} ${Math.random()}.jsonl`);
  const run = await execute(
    process.execPath,
    [
      script.pathname,
      kind,
      "--sessions-dir",
      sessions,
      "--workspace",
      workspace,
      "--output",
      output,
      ...args,
    ],
    { cwd: workspace },
  );
  const text = await readFile(output, "utf8");
  return {
    summary: JSON.parse(run.stdout),
    // Discovery order is not part of the contract; sort by source location.
    records: (text.trim()
      ? text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : []
    ).sort((a, b) => a.sessionFile.localeCompare(b.sessionFile) || (a.line ?? 0) - (b.line ?? 0)),
  };
}

/** Fixture with known totals: 4 bash, 2 read, 1 edit calls; 2 bash timeouts. */
async function toolFixture() {
  await session("a dir/one.jsonl", workspace, [
    system(["bash", "read", "edit", "code_find"]),
    call("c1", "bash", { command: "pnpm test", timeout: 60 }),
    result("c1", "bash", "Command timed out after 60 seconds", true),
    call("c2", "read", { path: "log.txt" }),
    result("c2", "read", "contents"),
    call("c3", "bash", { command: "pnpm vitest run x" }),
    result("c3", "bash", "ok"),
    call("c4", "edit", { path: "a.ts" }),
    result("c4", "edit", "edited"),
  ]);
  await session("b dir/two.jsonl", join(workspace, "pkg"), [
    system(["bash", "read", "web_search"]),
    call("d1", "bash", { command: "sleep 999", timeout: 5 }),
    result("d1", "bash", "Command timed out after 5 seconds", true),
    call("d2", "bash", { command: "echo done" }),
    result("d2", "bash", "done"),
    call("d3", "read", { path: "x" }),
    result("d3", "read", "x"),
  ]);
  await session("other.jsonl", join(root, "elsewhere"), [
    system(["bash"]),
    call("e1", "bash", { command: "ls" }),
    result("e1", "bash", "Command timed out after 1 seconds", true),
  ]);
}

describe("session-analytics export CLI", () => {
  it("exports every in-scope tool call with results and yields the known per-tool totals", async () => {
    await toolFixture();
    const { summary, records } = await exportKind("tool-calls");

    const perTool: Record<string, number> = {};
    for (const record of records) perTool[record.tool] = (perTool[record.tool] ?? 0) + 1;
    expect(perTool).toEqual({ bash: 4, read: 2, edit: 1 });
    expect(summary).toMatchObject({ kind: "tool-calls", records: 7 });
    expect(summary.coverage).toMatchObject({
      scannedSessions: 3,
      scopedSessions: 2,
      complete: true,
    });
    expect(records[0]).toMatchObject({
      sessionFile: join(sessions, "a dir/one.jsonl"),
      line: 3,
      cwd: workspace,
      model: "test-model",
      args: { command: "pnpm test", timeout: 60 },
      isError: true,
      resultBytes: 34,
      resultHead: "Command timed out after 60 seconds",
    });
  });

  it("selects failures by tool and result pattern and attaches the agent's next calls", async () => {
    await toolFixture();
    const { records } = await exportKind("tool-calls", [
      "--tool",
      "bash",
      "--match",
      "timed out after \\d+ seconds",
      "--next",
      "2",
    ]);

    expect(records.map((r) => r.args)).toEqual([
      { command: "pnpm test", timeout: 60 },
      { command: "sleep 999", timeout: 5 },
    ]);
    // Each next call carries its own outcome, so a retry's success is visible.
    expect(records[0].next).toEqual([
      { tool: "read", args: { path: "log.txt" }, isError: false, resultHead: "contents" },
      { tool: "bash", args: { command: "pnpm vitest run x" }, isError: false, resultHead: "ok" },
    ]);
    // Next calls stop at the session end rather than borrowing from another session.
    expect(records[1].next).toEqual([
      { tool: "bash", args: { command: "echo done" }, isError: false, resultHead: "done" },
      { tool: "read", args: { path: "x" }, isError: false, resultHead: "x" },
    ]);
  });

  it("truncates long arguments and result heads to the documented bounds", async () => {
    await session("long.jsonl", workspace, [
      call("l1", "write", { path: "a", content: "x".repeat(1000), list: Array(20).fill(1) }),
      result("l1", "write", "y".repeat(2000)),
    ]);
    const [record] = (await exportKind("tool-calls")).records;

    expect(record.argsTruncated).toBe(true);
    expect(record.args.content).toHaveLength(301);
    expect(record.args.list).toHaveLength(10);
    expect(record.resultHead).toHaveLength(501);
    expect(record.resultBytes).toBe(2000);
  });

  it("replays system messages and compaction checkpoints into available versus called tools", async () => {
    await toolFixture();
    await session("c dir/compacted.jsonl", workspace, [
      system(["bash", "read", "write"]),
      system([], ["write"]),
      call("f1", "read", { path: "a" }),
      {
        type: "compaction",
        timestamp: at(),
        summary: "s",
        firstKeptEntryId: "x",
        systemMessage: { role: "system", content: "", toolsAdded: [{ name: "grep" }] },
      },
      call("f2", "grep", { pattern: "a" }),
    ]);
    const { records } = await exportKind("tool-availability");

    expect(records.map((r) => [r.sessionId, r.available, r.called])).toEqual([
      ["a dir/one.jsonl", ["bash", "code_find", "edit", "read"], { bash: 2, edit: 1, read: 1 }],
      ["b dir/two.jsonl", ["bash", "read", "web_search"], { bash: 2, read: 1 }],
      ["c dir/compacted.jsonl", ["bash", "grep", "read", "write"], { grep: 1, read: 1 }],
    ]);
    expect(records.every((r) => r.loadoutKnown)).toBe(true);
  });

  it("exports debug event sizes by source, level, and category without payloads", async () => {
    await session("debug.jsonl", workspace, [
      debugEvent("lsp", "debug", "request.timing", Date.parse("2026-11-01T00:00:00Z")),
      debugEvent("lsp", "debug", "request.timing", Date.parse("2026-11-02T00:00:00Z")),
      debugEvent("lsp", "debug", "request.timing", Date.parse("2026-11-02T00:00:01Z")),
      debugEvent("tree-sitter", "info", "parse", Date.parse("2026-11-03T00:00:00Z")),
      call("g1", "bash", { command: "ls" }),
    ]);
    const { records } = await exportKind("debug-events", ["--since", "2026-11-02"]);

    const totals: Record<string, { count: number; bytes: number }> = {};
    for (const r of records) {
      const key = `${r.source}/${r.level}/${r.category}`;
      totals[key] = {
        count: (totals[key]?.count ?? 0) + 1,
        bytes: (totals[key]?.bytes ?? 0) + r.bytes,
      };
    }
    // Measured with `wc -c`: each stored line is 192 (lsp) or 190 (tree-sitter) bytes.
    expect(totals).toEqual({
      "lsp/debug/request.timing": { count: 2, bytes: 384 },
      "tree-sitter/info/parse": { count: 1, bytes: 190 },
    });
    expect(records.map((r) => r.line)).toEqual([3, 4, 5]);
    expect(JSON.stringify(records)).not.toContain("SECRET");
  });

  it("keeps parallel calls out of next and exports calls whose result never arrived", async () => {
    await session("parallel.jsonl", workspace, [
      {
        type: "message",
        timestamp: at(),
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "p1", name: "bash", arguments: { command: "slow" } },
            { type: "toolCall", id: "p2", name: "read", arguments: { path: "a" } },
          ],
        },
      },
      result("p1", "bash", "Command timed out after 1 seconds", true),
      result("p2", "read", "a"),
      call("p3", "bash", { command: "retry" }),
    ]);
    const { records } = await exportKind("tool-calls", ["--tool", "bash"]);

    expect(records.map((r) => [r.args.command, r.isError, r.next])).toEqual([
      [
        "slow",
        true,
        [{ tool: "bash", args: { command: "retry" }, isError: null, resultHead: null }],
      ],
      ["retry", null, []],
    ]);
  });

  it("limits tool calls and availability to the --since window", async () => {
    clock = Date.parse("2026-10-01T00:00:00Z");
    await session("old.jsonl", workspace, [
      system(["bash"]),
      call("o1", "bash", { command: "old" }),
    ]);
    await session("mixed.jsonl", workspace, [
      system(["bash", "read"]),
      call("m1", "bash", { command: "before" }),
    ]);
    clock = Date.parse("2026-11-10T00:00:00Z");
    await writeFile(
      join(sessions, "mixed.jsonl"),
      `\n${JSON.stringify(call("m2", "read", { path: "after" }))}`,
      { flag: "a" },
    );
    await session("idle.jsonl", workspace, [system(["bash", "web_search"])]);

    const calls = await exportKind("tool-calls", ["--since", "2026-11-01"]);
    expect(calls.records.map((r) => r.args)).toEqual([{ path: "after" }]);
    const availability = await exportKind("tool-availability", ["--since", "2026-11-01"]);
    expect(availability.records.map((r) => [r.sessionId, r.available, r.called])).toEqual([
      ["idle.jsonl", ["bash", "web_search"], {}],
      ["mixed.jsonl", ["bash", "read"], { read: 1 }],
    ]);
  });

  it("refuses to overwrite an existing output file and rejects options of other kinds", async () => {
    const output = join(root, "existing.jsonl");
    await writeFile(output, "keep");
    const base = [script.pathname, "--sessions-dir", sessions, "--workspace", workspace];

    await expect(
      execute(process.execPath, [...base, "tool-calls", "--output", output]),
    ).rejects.toThrow(/EEXIST/);
    expect(await readFile(output, "utf8")).toBe("keep");
    await expect(
      execute(process.execPath, [
        ...base,
        "debug-events",
        "--tool",
        "bash",
        "--output",
        `${output}2`,
      ]),
    ).rejects.toThrow(/tool-calls only/);
  });
});
