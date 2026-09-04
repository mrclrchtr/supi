import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspaceSourceInventory } from "@mrclrchtr/supi-lsp/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLspMaintenanceState,
  trackCreatedSources,
} from "../../../../src/substrate/lsp/source-tracking.ts";

let tmpDir = "";

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  }
});

function inventory(files: readonly string[]): WorkspaceSourceInventory {
  return {
    status: "complete",
    reason: null,
    observedFileCount: files.length,
    files,
  };
}

describe("created-source tracking state", () => {
  it("establishes a lifecycle-seeded baseline without tracking existing files", async () => {
    const files = Array.from({ length: 12_001 }, (_, index) => `/project/src/file-${index}.ts`);
    const scanWorkspaceSources = vi.fn().mockResolvedValue(inventory(files));
    const bulkTrackFiles = vi.fn();
    const state = createLspMaintenanceState(new Map([["/project/package.json", 1]]));

    const result = await trackCreatedSources({
      runtime: { scanWorkspaceSources, bulkTrackFiles } as never,
      cwd: "/project",
      state,
    });

    expect(result.report).toMatchObject({
      status: "complete",
      observedFileCount: 12_001,
      discovered: [],
      tracked: [],
      deferred: 0,
    });
    expect(result.state.sourceBaseline).toEqual(new Set(files));
    expect(bulkTrackFiles).not.toHaveBeenCalled();
  });

  it("diffs a complete baseline and retains only retryable or unstarted paths", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "source-tracking-"));
    const existing = path.join(tmpDir, "existing.ts");
    const tracked = path.join(tmpDir, "tracked.ts");
    const unsupported = path.join(tmpDir, "unsupported.ts");
    const unavailable = path.join(tmpDir, "unavailable.ts");
    for (const file of [existing, tracked, unsupported, unavailable]) writeFileSync(file, "\n");

    const scanWorkspaceSources = vi
      .fn()
      .mockResolvedValueOnce(inventory([existing]))
      .mockResolvedValueOnce(inventory([existing, tracked, unsupported, unavailable]));
    const bulkTrackFiles = vi.fn().mockResolvedValue({
      outcomes: [
        { file: tracked, kind: "tracked" },
        { file: unsupported, kind: "unsupported", reason: "not-automatic-source" },
        { file: unavailable, kind: "unavailable", reason: "route unavailable" },
      ],
    });
    const runtime = { scanWorkspaceSources, bulkTrackFiles } as never;
    const first = await trackCreatedSources({
      runtime,
      cwd: tmpDir,
      state: createLspMaintenanceState(),
    });
    const second = await trackCreatedSources({
      runtime,
      cwd: tmpDir,
      state: first.state,
    });

    expect(second.report).toMatchObject({
      discovered: ["tracked.ts", "unsupported.ts", "unavailable.ts"],
      tracked: ["tracked.ts"],
      unsupported: ["unsupported.ts"],
      unavailable: ["unavailable.ts"],
      deferred: 1,
    });
    expect(second.state.createdSourceQueue).toEqual([unavailable]);
    expect(second.state.sourceBaseline).toEqual(
      new Set([existing, tracked, unsupported, unavailable]),
    );
  });

  it("passes no more than 256 created paths to one bulk batch", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "source-tracking-batch-"));
    const existing = path.join(tmpDir, "existing.ts");
    writeFileSync(existing, "\n");
    const baseline = [existing];
    const created = Array.from({ length: 300 }, (_, index) => {
      const file = path.join(tmpDir, `new-${index}.ts`);
      writeFileSync(file, "\n");
      return file;
    });
    const bulkTrackFiles = vi.fn(async (files: readonly string[]) => ({
      outcomes: files.map((file) => ({ file, kind: "tracked" as const })),
    }));
    const runtime = {
      scanWorkspaceSources: vi
        .fn()
        .mockResolvedValueOnce(inventory(baseline))
        .mockResolvedValueOnce(inventory([...baseline, ...created])),
      bulkTrackFiles,
    } as never;
    const first = await trackCreatedSources({
      runtime,
      cwd: tmpDir,
      state: createLspMaintenanceState(),
    });
    const second = await trackCreatedSources({ runtime, cwd: tmpDir, state: first.state });

    expect(bulkTrackFiles).toHaveBeenCalledWith(created.slice(0, 256), undefined);
    expect(second.report.tracked).toHaveLength(256);
    expect(second.report.deferred).toBe(44);
  });

  it("keeps the previous baseline and queue when discovery is limited", async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "source-tracking-limited-"));
    const pending = path.join(tmpDir, "pending.ts");
    writeFileSync(pending, "\n");
    const state = {
      ...createLspMaintenanceState(),
      sourceBaseline: new Set([path.join(tmpDir, "existing.ts")]),
      createdSourceQueue: [pending],
    };
    const limited: WorkspaceSourceInventory = {
      status: "limited",
      reason: "file-limit",
      observedFileCount: 50_001,
      files: [],
    };
    const bulkTrackFiles = vi.fn();

    const result = await trackCreatedSources({
      runtime: {
        scanWorkspaceSources: vi.fn().mockResolvedValue(limited),
        bulkTrackFiles,
      } as never,
      cwd: tmpDir,
      state,
    });

    expect(result.state).toBe(state);
    expect(result.report).toMatchObject({
      status: "limited",
      reason: "file-limit",
      discovered: [],
      tracked: [],
      unavailable: [],
      deferred: 1,
    });
    expect(bulkTrackFiles).not.toHaveBeenCalled();
  });
});
