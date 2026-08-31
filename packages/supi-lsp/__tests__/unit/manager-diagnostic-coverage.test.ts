import { describe, expect, it, vi } from "vitest";
import { LspManager } from "../../src/manager/manager.ts";
import { createAutomaticLspPathPolicy } from "../../src/workspace-path-policy.ts";

const config = {
  servers: {
    typescript: {
      command: "node",
      args: [],
      fileTypes: ["ts"],
      rootMarkers: ["package.json"],
    },
  },
};

function createManager(): LspManager {
  return new LspManager(config, "/project");
}

function clients(manager: LspManager): Map<string, unknown> {
  return (manager as unknown as { clients: Map<string, unknown> }).clients;
}

describe("LspManager automatic path support", () => {
  it("keeps explicit route capability while excluding automatic source support", () => {
    const policy = createAutomaticLspPathPolicy("/project", ["generated/**"]);
    const manager = new LspManager(config, "/project", undefined, policy);

    expect(manager.canServeFile("/project/.pi/source.ts")).toBe(true);
    expect(manager.isSupportedSourceFile("/project/.pi/source.ts")).toBe(false);
    expect(manager.canServeFile("/project/generated/source.ts")).toBe(true);
    expect(manager.isSupportedSourceFile("/project/generated/source.ts")).toBe(false);
  });

  it("filters excluded files from runtime guidance", () => {
    const manager = new LspManager(
      config,
      "/project",
      undefined,
      createAutomaticLspPathPolicy("/project", ["generated/**"]),
    );
    clients(manager).set("typescript:/project", {
      name: "typescript",
      root: "/project",
      status: "running",
      ready: true,
      openFiles: ["/project/src/app.ts", "/project/.pi/private.ts", "/project/generated/drop.ts"],
      serverCapabilities: {},
      getDiagnosticSnapshot: () => ({ entries: [], documents: [], current: true }),
      pruneMissingFiles: () => [],
    });

    expect(manager.getKnownProjectServers([])[0]?.openFiles).toEqual(["src/app.ts"]);
  });
});

describe("LspManager diagnostic evidence coverage", () => {
  it("does not call an empty tracked set clean when one document is stale", () => {
    const manager = createManager();
    clients(manager).set("typescript:/project", {
      getDiagnosticSnapshot: () => ({
        entries: [],
        documents: [
          { uri: "file:///project/src/a.ts", current: false, status: "unconfirmed" },
          { uri: "file:///project/src/b.ts", current: true, status: "confirmed" },
        ],
        current: false,
      }),
      pruneMissingFiles: () => [],
    });

    expect(manager.getDiagnosticSnapshot()).toEqual({
      entries: [],
      current: false,
      evidence: {
        requested: 2,
        confirmed: 1,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
        documents: [
          { file: "src/a.ts", status: "unconfirmed" },
          { file: "src/b.ts", status: "confirmed" },
        ],
      },
    });
  });

  it("captures summary and detailed diagnostics from one client snapshot", () => {
    const manager = createManager();
    let snapshotCalls = 0;
    clients(manager).set("typescript:/project", {
      getDiagnosticSnapshot: () => {
        snapshotCalls++;
        if (snapshotCalls > 1) throw new Error("diagnostic cache was observed twice");
        return {
          entries: [
            {
              uri: "file:///project/src/new.ts",
              diagnostics: [
                {
                  message: "New diagnostic",
                  severity: 1,
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                },
              ],
              current: true,
            },
          ],
          documents: [{ uri: "file:///project/src/new.ts", current: true, status: "confirmed" }],
          current: true,
        };
      },
      pruneMissingFiles: () => [],
    });

    expect(manager.getWorkspaceDiagnosticReport()).toEqual({
      summary: {
        entries: [{ file: "src/new.ts", errors: 1, warnings: 0 }],
        current: true,
        evidence: {
          requested: 1,
          confirmed: 1,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
          documents: [{ file: "src/new.ts", status: "confirmed" }],
        },
      },
      outstanding: {
        entries: [
          {
            file: "src/new.ts",
            diagnostics: [expect.objectContaining({ message: "New diagnostic", severity: 1 })],
          },
        ],
        current: true,
        evidence: {
          requested: 1,
          confirmed: 1,
          unconfirmed: 0,
          failed: 0,
          removed: 0,
          documents: [{ file: "src/new.ts", status: "confirmed" }],
        },
      },
    });
    expect(snapshotCalls).toBe(1);
  });

  it("filters excluded paths from ambient diagnostic summaries and evidence", () => {
    const manager = new LspManager(
      config,
      "/project",
      undefined,
      createAutomaticLspPathPolicy("/project", ["generated/**"]),
    );
    const makeEntry = (file: string) => ({
      uri: `file:///project/${file}`,
      diagnostics: [
        {
          message: file,
          severity: 1,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
      current: true,
    });
    const entries = [
      makeEntry("src/app.ts"),
      makeEntry(".pi/private.ts"),
      makeEntry("generated/drop.ts"),
    ];
    clients(manager).set("typescript:/project", {
      getDiagnosticSnapshot: () => ({
        entries,
        documents: entries.map((entry) => ({
          uri: entry.uri,
          current: true,
          status: "confirmed",
        })),
        current: true,
      }),
      pruneMissingFiles: () => [],
    });

    const report = manager.getWorkspaceDiagnosticReport();
    expect(report.summary.entries).toEqual([{ file: "src/app.ts", errors: 1, warnings: 0 }]);
    expect(report.outstanding.entries.map((entry) => entry.file)).toEqual(["src/app.ts"]);
    expect(report.summary.evidence.documents).toEqual([
      { file: "src/app.ts", status: "confirmed" },
    ]);
  });

  it("reports an empty tracked set as complete with zero coverage", () => {
    const manager = createManager();
    clients(manager).set("typescript:/project", {
      getDiagnosticSnapshot: () => ({ entries: [], documents: [], current: true }),
      pruneMissingFiles: () => [],
    });

    expect(manager.getDiagnosticSnapshot()).toEqual({
      entries: [],
      current: true,
      evidence: {
        requested: 0,
        confirmed: 0,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [],
      },
    });
  });

  it("aggregates mixed pull and push refresh evidence without dropping failures", async () => {
    const manager = createManager();
    const pull = {
      status: "running",
      openFiles: ["/project/src/pull.ts"],
      refreshOpenDiagnostics: vi.fn().mockResolvedValue({
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [{ file: "/project/src/pull.ts", status: "confirmed" as const }],
      }),
    };
    const push = {
      status: "running",
      openFiles: ["/project/src/push.ts", "/project/src/failing.ts"],
      refreshOpenDiagnostics: vi.fn().mockResolvedValue({
        requested: 2,
        confirmed: 0,
        unconfirmed: 1,
        failed: 1,
        removed: 0,
        documents: [
          { file: "/project/src/push.ts", status: "unconfirmed" as const },
          { file: "/project/src/failing.ts", status: "failed" as const },
        ],
      }),
    };
    clients(manager).set("typescript:/project/pull", pull);
    clients(manager).set("typescript:/project/push", push);

    await expect(manager.refreshOpenDiagnostics({ maxWaitMs: 10 })).resolves.toEqual({
      requested: 3,
      confirmed: 1,
      unconfirmed: 1,
      failed: 1,
      removed: 0,
      documents: [
        { file: "src/failing.ts", status: "failed" },
        { file: "src/pull.ts", status: "confirmed" },
        { file: "src/push.ts", status: "unconfirmed" },
      ],
    });
  });
});
