import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  // Keep last-gather markers out of the real agent directory.
  vi.stubEnv("PI_CODING_AGENT_DIR", join(root, "agent"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
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

function withData(entry: ReturnType<typeof retrospective>, data: Record<string, unknown>) {
  return { ...entry, data: { ...entry.data, data: { ...entry.data.data, ...data } } };
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
    expect(preview.display).toMatchObject({
      complete: true,
      displayedReports: 2,
      remainingReports: 0,
    });
    expect(preview.nextCommand).toBeNull();
    expect(preview.summary).toEqual({
      reports: 2,
      containingSessions: 1,
      bySource: { "supi-agent": 1, "supi-review": 1 },
      byStatus: { completed: 2, failed: 0 },
      earliest: "1970-01-01T00:00:00.500Z",
      latest: "1970-01-01T00:00:01.000Z",
    });
    expect(evidence.summary).toEqual(preview.summary);
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
    expect(preview.records).toHaveLength(1);
    expect(preview.records[0].ref).toBe(evidence.records[0].ref);
    expect(preview.records[0].textRange).toMatchObject({ start: 0, total: longText.length });
    expect(preview.records[0].textRange.end).toBeLessThan(longText.length);
    expect(preview.records[0].text.endsWith("🧭")).toBe(true);
    expect(preview.display).toMatchObject({ complete: false, remainingReports: 2, nextOffset: 0 });
    expect(preview.nextCommand).toContain("--text-offset");
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
    });
    expect(first.evidence.records).toHaveLength(2);
    expect(first.preview.display).toMatchObject({ displayedReports: 1, nextOffset: 1 });
    expect(first.evidence.records[0].runKey).toBe("shared");
    const ref = first.evidence.records[0].ref;
    // A new session must not shift snapshot offsets or change the original scan evidence.
    await session("new.jsonl", workspace, [retrospective("new", "Newer.", "supi-agent", 3000)]);
    const result = await execute("/bin/sh", ["-c", first.preview.nextCommand]);
    const second = JSON.parse(result.stdout);
    expect(second.records[0].text).toBe("Older.");
    expect(second.display.complete).toBe(true);
    expect(second.nextCommand).toBeNull();
    expect(second.coverage).toEqual(first.preview.coverage);
    await rm(output);
    expect((await collect()).evidence.records[1].ref).toBe(ref);
  });

  it("reads every report and oversized fragment exactly once without original storage", async () => {
    // Include shell-sensitive paths and JSON escaping as well as multibyte characters.
    output = join(root, "evidence ' quoted.json");
    const entries = Array.from({ length: 25 }, (_, i) =>
      retrospective(
        `run-${i}`,
        `${i}: ${'🧭"\\\n'.repeat(i === 0 ? 5000 : 150)}`,
        i % 2 ? "supi-review" : "supi-agent",
        1000 - i,
      ),
    );
    await session("a.jsonl", workspace, entries);
    const { preview, evidence } = await collect();
    const originalSnapshot = await readFile(output, "utf8");
    await rm(sessions, { recursive: true });
    const texts = new Map<string, string>();
    let page = preview;
    let pages = 0;
    while (true) {
      expect(Buffer.byteLength(JSON.stringify(page)) + 1).toBeLessThanOrEqual(16_000);
      expect(page.coverage.complete).toBe(true);
      expect(page.summary).toEqual(preview.summary);
      for (const record of page.records) {
        const previous = texts.get(record.ref) ?? "";
        if (record.textRange) expect(record.textRange.start).toBe(previous.length);
        else expect(texts.has(record.ref)).toBe(false);
        texts.set(record.ref, previous + record.text);
      }
      pages++;
      expect(pages).toBeLessThan(30);
      if (page.display.complete) break;
      expect(page.display.remainingReports).toBeGreaterThan(0);
      const result = await execute("/bin/sh", ["-c", page.nextCommand], {
        env: { ...process.env, PI_CODING_AGENT_SESSION_DIR: "/does-not-exist" },
      });
      page = JSON.parse(result.stdout);
    }
    expect(pages).toBeGreaterThan(2);
    expect(page.nextCommand).toBeNull();
    expect(texts.size).toBe(25);
    for (const record of evidence.records) expect(texts.get(record.ref)).toBe(record.text);
    expect(await readFile(output, "utf8")).toBe(originalSnapshot);
  });

  it("selects refs from a snapshot and rejects unknown refs, invalid cursors, and mixed modes", async () => {
    await session("a.jsonl", workspace, [
      retrospective("one", "First."),
      retrospective("two", "Second."),
    ]);
    const { evidence } = await collect();
    const read = (...args: string[]) =>
      execute(process.execPath, [script.pathname, "--read", output, ...args]);
    const result = JSON.parse((await read("--refs", evidence.records[1].ref)).stdout);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].text).toBe(evidence.records[1].text);
    expect(result.display).toMatchObject({ complete: true, selectedReports: 1 });
    expect(result.summary.reports).toBe(2);
    await expect(read("--refs", "R-0000000000000000")).rejects.toMatchObject({ code: 1 });
    await expect(read("--offset", "3")).rejects.toMatchObject({ code: 1 });
    await expect(read("--text-offset", "999")).rejects.toMatchObject({ code: 1 });
    await expect(read("--workspace", workspace)).rejects.toMatchObject({ code: 1 });
    await expect(read("--output", output)).rejects.toMatchObject({ code: 1 });
    await expect(read("--max-sessions", "5")).rejects.toMatchObject({ code: 1 });
    await writeFile(output, JSON.stringify({ version: 0, records: [] }));
    await expect(read()).rejects.toMatchObject({ code: 1 });
  });

  it("exports complete assessments as JSONL without pagination or overwriting", async () => {
    const longText = "🧭\n".repeat(20_000);
    await session("a.jsonl", workspace, [
      retrospective("large", longText, "supi-agent", 2000),
      retrospective("small", "Short.", "supi-review"),
    ]);
    const { evidence } = await collect();
    const exportFile = join(root, "reports.jsonl");
    const run = (...args: string[]) =>
      execute(process.execPath, [script.pathname, "--read", output, ...args]);
    const result = JSON.parse((await run("--export", exportFile)).stdout);
    expect(result).toMatchObject({ exportFile, exportedReports: 2, summary: { reports: 2 } });
    const lines = (await readFile(exportFile, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines.map((line) => line.ref)).toEqual(
      evidence.records.map((r: { ref: string }) => r.ref),
    );
    expect(lines[0]).toMatchObject({
      text: longText,
      file: "a.jsonl",
      line: 2,
      source: "supi-agent",
    });
    await expect(run("--export", exportFile)).rejects.toMatchObject({ code: 1 });
    await expect(run("--export", join(root, "x.jsonl"), "--offset", "1")).rejects.toMatchObject({
      code: 1,
    });
    await rm(output);
    await expect(collect(["--export", exportFile])).rejects.toMatchObject({ code: 1 });
  });

  it("summarizes an empty snapshot without a continuation or invented dates", async () => {
    const { preview } = await collect();
    expect(preview.summary).toEqual({
      reports: 0,
      containingSessions: 0,
      bySource: { "supi-agent": 0, "supi-review": 0 },
      byStatus: { completed: 0, failed: 0 },
      earliest: null,
      latest: null,
    });
    expect(preview.display).toMatchObject({ complete: true, remainingReports: 0 });
    expect(preview.nextCommand).toBeNull();
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

  it("--since-last collects only reports after the previous gather of the same scope", async () => {
    const now = Date.now();
    await session("a.jsonl", workspace, [retrospective("old", "Old.", "supi-agent", now - 60_000)]);
    const first = await collect(["--since-last"]);
    expect(first.preview.scope).toMatchObject({ since: null, previousGather: null });
    expect(first.evidence.records).toHaveLength(1);
    const marker = first.preview.scope.recordedGather;
    expect(marker).toEqual(expect.any(String));

    // Another scope keeps its own marker; a commit or gap-leaving filter does not advance it.
    await rm(output);
    expect((await collect(["--source", "supi-review"])).preview.scope.previousGather).toBeNull();

    await session("b.jsonl", workspace, [retrospective("new", "New.", "supi-agent", now + 60_000)]);
    await rm(output);
    const second = await collect(["--since-last"]);
    expect(second.preview.scope).toMatchObject({ since: marker, previousGather: marker });
    expect(second.evidence.records.map((record: { runKey: string }) => record.runKey)).toEqual([
      "new",
    ]);

    await rm(output);
    const unrecorded = await collect(["--since-last", "--no-record"]);
    expect(unrecorded.preview.scope).toMatchObject({
      previousGather: second.preview.scope.recordedGather,
      recordedGather: null,
    });

    await rm(output);
    const gap = await collect(["--since", new Date(now + 3_600_000).toISOString()]);
    expect(gap.preview.scope).toMatchObject({
      recordedGather: null,
      recordSkipReason: "since-after-previous-gather",
    });
    await rm(output);
    const otherScope = await collect(["--since", "7d", "--source", "supi-agent"]);
    expect(otherScope.preview.scope).toMatchObject({
      recordedGather: null,
      recordSkipReason: "since-without-previous-gather",
    });
    await expect(collect(["--since", "30d", "--since-last"])).rejects.toMatchObject({ code: 1 });
  });

  it("carries numeric prompt revisions and omits invalid ones", async () => {
    await session("a/session.jsonl", workspace, [
      withData(retrospective("new", "Revised.", "supi-agent", 2000), { promptRevision: 2 }),
      withData(retrospective("bad", "Invalid.", "supi-agent", 1000), { promptRevision: "2" }),
    ]);

    const { preview, evidence } = await collect();
    expect(
      evidence.records.map((record: { promptRevision?: number }) => record.promptRevision),
    ).toEqual([2, undefined]);
    expect(preview.records[0]).toMatchObject({ promptRevision: 2 });
    expect(preview.records[1]).not.toHaveProperty("promptRevision");
  });

  it("filters by recorded runtime provenance with --since-commit and counts unknown sessions", async () => {
    const gitArgs = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
    const commitAt = async (date: string) => {
      const env = { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date };
      await execute("git", [...gitArgs, "commit", "-q", "--allow-empty", "-m", date], {
        cwd: workspace,
        env,
      });
      return (await execute("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
    };
    await execute("git", ["init", "-q"], { cwd: workspace });
    const old = await commitAt("2026-01-01T00:00:00Z");
    const fresh = await commitAt("2026-02-01T00:00:00Z");
    const provenance = (commit: string, commitTime: string, dirty = false) => ({
      type: "custom",
      customType: "supi-debug-event",
      data: {
        id: 2,
        timestamp: 900,
        source: "supi-debug",
        level: "info",
        category: "runtime-provenance",
        message: "SuPi runtime provenance",
        data: { version: "1.0.0", commit, commitTime, dirty, reason: "startup" },
      },
    });
    await session("old.jsonl", workspace, [
      provenance(old, "2026-01-01T00:00:00Z"),
      retrospective("old", "Old code."),
    ]);
    await session("new.jsonl", workspace, [
      provenance(old, "2026-01-01T00:00:00Z"),
      retrospective("before-reload", "Before reload."),
      provenance(fresh, "2026-02-01T00:00:00Z", true),
      retrospective("after-reload", "After reload."),
    ]);
    await session("unknown.jsonl", workspace, [retrospective("unknown", "No provenance.")]);

    const { preview, evidence } = await collect(["--since-commit", fresh]);

    expect(evidence.records.map((record: { runKey: string }) => record.runKey)).toEqual([
      "after-reload",
    ]);
    expect(evidence.records[0].provenance).toMatchObject({ commit: fresh, dirty: true });
    expect(evidence.coverage.unknownProvenance).toBe(1);
    expect(preview.scope.sinceCommit).toMatchObject({ rev: fresh, commit: fresh });
    expect(preview.records[0]).toMatchObject({ commit: fresh.slice(0, 12), dirty: true });
  });

  it("rejects an unresolvable --since-commit", async () => {
    await expect(collect(["--since-commit", "does-not-exist"])).rejects.toThrow(
      /could not resolve does-not-exist/,
    );
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
    expect(evidence.summary.byStatus).toEqual({ completed: 1, failed: 1 });
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
