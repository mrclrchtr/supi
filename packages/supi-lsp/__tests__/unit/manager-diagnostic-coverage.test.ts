import { describe, expect, it, vi } from "vitest";
import { LspManager } from "../../src/manager/manager.ts";

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
