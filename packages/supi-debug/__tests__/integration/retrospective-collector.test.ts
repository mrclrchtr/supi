import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const script = new URL("../../skills/gather-retrospectives/scripts/collect.mjs", import.meta.url);
let root: string;
let sessions: string;
let workspace: string;
let output: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "supi-retrospectives-"));
  sessions = join(root, "sessions");
  workspace = join(root, "project");
  output = join(root, "evidence.json");
  await Promise.all([mkdir(sessions), mkdir(workspace)]);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function retrospective(runKey: string, text: string, source = "supi-agent", timestamp = 1000) {
  return {
    type: "custom",
    id: `entry-${runKey}`,
    customType: "supi-debug-event",
    data: {
      id: 1,
      timestamp,
      source,
      level: "info",
      category: "agent-run-retrospective",
      message: "Agent Run retrospective",
      rawData: { credential: "raw-only-value" },
      data: { runKey, status: "completed", text, taskId: runKey, label: runKey },
    },
  };
}

async function session(name: string, cwd: string, entries: unknown[]) {
  const path = join(sessions, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [{ type: "session", id: name, cwd }, ...entries]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
  );
  return path;
}

async function collect(args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  const result = await execute(
    process.execPath,
    [
      script.pathname,
      "--sessions-dir",
      sessions,
      "--workspace",
      workspace,
      "--output",
      output,
      ...args,
    ],
    { cwd: workspace, env: { ...process.env, ...env } },
  );
  return {
    preview: JSON.parse(result.stdout),
    evidence: JSON.parse(await readFile(output, "utf8")),
  };
}

describe("retrospective collector CLI", () => {
  it("collects real events from the requested workspace, not quoted messages or raw payloads", async () => {
    const report = retrospective("one", "Tool guidance referred to unavailable grep.");
    await session("a/session.jsonl", workspace, [
      report,
      { type: "message", message: { role: "toolResult", content: JSON.stringify(report) } },
      retrospective("review", "Clear task scope.", "supi-review", 500),
      { ...report, data: { ...report.data, category: "other" } },
    ]);
    await session("b/session.jsonl", `${workspace}-other`, [retrospective("other", "Unrelated.")]);

    const { preview, evidence } = await collect();
    expect(evidence.records).toHaveLength(2);
    expect(evidence.coverage).toMatchObject({
      scannedSessions: 2,
      scopedSessions: 1,
      uniqueReports: 2,
      complete: true,
    });
    expect(evidence.records[0]).toMatchObject({
      text: "Tool guidance referred to unavailable grep.",
      sessionFile: join(sessions, "a/session.jsonl"),
      line: 2,
      entryId: "entry-one",
      source: "supi-agent",
    });
    expect(JSON.stringify(evidence)).not.toContain("raw-only-value");
    expect(preview.records[0]).toMatchObject({
      text: "Tool guidance referred to unavailable grep.",
      date: "1970-01-01T00:00:01.000Z",
      file: "a/session.jsonl",
      line: 2,
    });
    expect(preview.evidenceFile).toBe(output);
    expect(preview.sessionsDir).toBe(sessions);
    expect(preview.omittedRefs).toEqual([]);
    expect(preview.records[0].entryId).toBeUndefined();
  });

  it("bounds stdout by UTF-8 bytes while preserving full assessments in the evidence file", async () => {
    const longText = "🧭".repeat(5000);
    await session("large.jsonl", workspace, [
      retrospective("large", longText, "supi-agent", 2000),
      retrospective("small", "Complete short assessment."),
    ]);
    const { preview, evidence } = await collect();
    expect(Buffer.byteLength(JSON.stringify(preview)) + 1).toBeLessThanOrEqual(16_000);
    expect(evidence.records[0].text).toBe(longText);
    expect(preview.omittedRefs).toEqual([evidence.records[0].ref]);
    expect(preview.records).toHaveLength(1);
    expect(preview.records[0].text).toBe("Complete short assessment.");
    expect(preview.coverage.returnedReports).toBe(2);
    expect(preview.coverage.complete).toBe(true);
  });

  it("preserves Unicode line separators inside assessment text", async () => {
    // biome-ignore lint/security/noSecrets: Unicode separator fixture, not a credential.
    const text = "First\u2028second\u2029third";
    await session("unicode.jsonl", workspace, [retrospective("unicode", text)]);
    const { evidence } = await collect();
    expect(evidence.records[0]).toMatchObject({ text, line: 2 });
    expect(evidence.coverage.complete).toBe(true);
  });

  it("deduplicates cloned runs and paginates with stable references and exact coverage", async () => {
    const shared = retrospective("shared", "Same run.", "supi-agent", 2000);
    await session("a.jsonl", workspace, [shared, retrospective("older", "Older.")]);
    await session("clone.jsonl", workspace, [shared]);

    const first = await collect(["--limit", "1"]);
    expect(first.evidence.coverage).toMatchObject({
      matchingEvents: 3,
      duplicateEvents: 1,
      uniqueReports: 2,
      returnedReports: 1,
      nextOffset: 1,
    });
    expect(first.evidence.records[0].runKey).toBe("shared");
    const ref = first.evidence.records[0].ref;
    await rm(output);
    const second = await collect(["--limit", "1", "--offset", "1"]);
    expect(second.evidence.records[0].runKey).toBe("older");
    expect(second.evidence.coverage.nextOffset).toBeNull();
    await rm(output);
    expect((await collect()).evidence.records[0].ref).toBe(ref);
  });

  it("supports explicit cross-workspace access and source/date filters", async () => {
    await session("a.jsonl", workspace, [retrospective("old", "Old.")]);
    await session("b.jsonl", "/another-project", [
      retrospective("new", "New.", "supi-review", Date.parse("2026-10-26T00:00:00Z")),
    ]);
    const result = await execute(process.execPath, [
      script.pathname,
      "--sessions-dir",
      sessions,
      "--all-workspaces",
      "--source",
      "supi-review",
      "--since",
      "2026-10-25",
      "--output",
      output,
    ]);
    expect(JSON.parse(result.stdout).coverage.uniqueReports).toBe(1);
    expect(JSON.parse(await readFile(output, "utf8")).records[0].runKey).toBe("new");
  });

  it("keeps legacy events without run keys and failed assessments without inventing text", async () => {
    const report = retrospective("legacy", "Legacy evidence.");
    const { runKey: _runKey, ...data } = report.data.data;
    await session("a.jsonl", workspace, [
      { ...report, data: { ...report.data, data } },
      {
        ...retrospective("failed", ""),
        data: { ...report.data, timestamp: 500, data: { status: "failed" } },
      },
    ]);
    const { evidence } = await collect();
    expect(evidence.records).toHaveLength(2);
    expect(evidence.records[0].text).toBe("Legacy evidence.");
    expect(evidence.records[1]).toMatchObject({ status: "failed" });
    expect(evidence.records[1].text).toBeUndefined();
  });

  it("reports incomplete coverage for malformed events and session scan limits", async () => {
    const path = await session("a.jsonl", workspace, [retrospective("good", "Valid.")]);
    await writeFile(path, `${await readFile(path, "utf8")}\n{"category":"agent-run-retrospective"`);
    await session("b.jsonl", workspace, [retrospective("second", "Not scanned.")]);
    const { evidence } = await collect(["--max-sessions", "1"]);
    expect(evidence.coverage).toMatchObject({
      complete: false,
      sessionLimitReached: true,
      malformedEntries: 1,
      uniqueReports: 1,
    });
  });

  it("marks torn entries before the category and invalid assessments as incomplete", async () => {
    const path = await session("torn.jsonl", workspace, [
      {
        type: "custom",
        customType: "supi-debug-event",
        data: { category: "agent-run-retrospective", status: "invalid" },
      },
    ]);
    await writeFile(
      path,
      `${await readFile(path, "utf8")}\n{"type":"custom","customType":"supi-debug-event","data":`,
    );
    const { evidence } = await collect();
    expect(evidence.coverage).toMatchObject({ complete: false, malformedEntries: 2 });
  });

  it("does not follow symlinked session files or claim complete coverage", async () => {
    const outside = join(root, "outside.jsonl");
    await writeFile(outside, JSON.stringify({ type: "session", cwd: workspace }));
    await symlink(outside, join(sessions, "linked.jsonl"));
    const { evidence } = await collect();
    expect(evidence.coverage.scannedSessions).toBe(0);
    expect(evidence.coverage.ignoredSymlinks).toBe(1);
    expect(evidence.coverage.complete).toBe(false);
  });

  it("honors project sessionDir and explicit storage overrides", async () => {
    await session("a.jsonl", workspace, [retrospective("configured", "Configured storage.")]);
    await mkdir(join(workspace, ".pi"));
    await writeFile(
      join(workspace, ".pi/settings.json"),
      JSON.stringify({ sessionDir: "../sessions" }),
    );
    const result = await execute(process.execPath, [script.pathname, "--output", output], {
      cwd: workspace,
      env: { ...process.env, PI_CODING_AGENT_DIR: root, PI_CODING_AGENT_SESSION_DIR: "" },
    });
    expect(JSON.parse(result.stdout).coverage.uniqueReports).toBe(1);
    await rm(output);
    expect(
      (await collect([], { PI_CODING_AGENT_SESSION_DIR: "/does-not-exist" })).evidence.records,
    ).toHaveLength(1);
  });

  it("fails invalid requests and refuses to overwrite existing output", async () => {
    await expect(collect(["--limit", "0"])).rejects.toMatchObject({ code: 1 });
    await expect(collect(["--since", "not-a-date"])).rejects.toMatchObject({ code: 1 });
    await writeFile(output, "preserve me");
    await expect(collect()).rejects.toMatchObject({ code: 1 });
    expect(await readFile(output, "utf8")).toBe("preserve me");
  });
});
