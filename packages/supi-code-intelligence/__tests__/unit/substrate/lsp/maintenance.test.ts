import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateConfig: vi.fn(),
  invalidateConfigDir: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    invalidateTsconfigCacheForConfig: mocks.invalidateConfig,
    invalidateTsconfigCacheForConfigDir: mocks.invalidateConfigDir,
  };
});

import {
  createAutomaticLspPathPolicy,
  scanWorkspaceSources,
  syncWorkspaceSentinelSnapshot,
} from "@mrclrchtr/supi-lsp/api";
import { refreshLspMaintenance } from "../../../../src/substrate/lsp/maintenance.ts";
import type { LspMaintenanceState } from "../../../../src/substrate/lsp/source-tracking.ts";

let tmpDir = "";

afterEach(() => {
  mocks.invalidateConfig.mockClear();
  mocks.invalidateConfigDir.mockClear();
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = "";
  }
});

function emptyEvidence() {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  };
}

function createMaintenanceState(): LspMaintenanceState {
  return {
    sentinelSnapshot: new Map(),
    sourceBaseline: null,
    createdSourceQueue: [],
  };
}

function makeRuntime(overrides: Record<string, unknown> = {}) {
  const runtime = {
    isSupportedSourceFile: vi.fn().mockReturnValue(true),
    scanWorkspaceSources: vi.fn((control?: never) =>
      scanWorkspaceSources(tmpDir, {
        fileTypes: ["ts"],
        policy: createAutomaticLspPathPolicy(tmpDir, []),
        control,
      }),
    ),
    syncWorkspaceSentinelSnapshot: vi.fn((previous: Map<string, number>) =>
      syncWorkspaceSentinelSnapshot(tmpDir, previous),
    ),
    trackFile: vi.fn().mockResolvedValue(true),
    bulkTrackFiles: vi.fn(async (filePaths: readonly string[]) => ({
      outcomes: await Promise.all(
        filePaths.map(async (file) => {
          if (!runtime.isSupportedSourceFile(file)) {
            return { file, kind: "unsupported" as const, reason: "not-automatic-source" as const };
          }
          return (await runtime.trackFile(file))
            ? { file, kind: "tracked" as const }
            : { file, kind: "unavailable" as const, reason: "track failed" };
        }),
      ),
    })),
    noteWorkspaceChanges: vi.fn(),
    refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
    getOutstandingDiagnostics: vi.fn().mockReturnValue({ entries: [] }),
    getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue({ evidence: emptyEvidence() }),
    closeFile: vi.fn(),
    pruneMissingFiles: vi.fn().mockReturnValue([]),
    ...overrides,
  };
  return runtime;
}

/** Run maintenance and return the immutable state for the next pass. */
async function runMaintenance(
  runtime: unknown,
  cwd: string,
  state: LspMaintenanceState,
  options: { scope?: string | null; trackSources?: boolean } = {},
) {
  return refreshLspMaintenance(runtime as never, cwd, state, options);
}

describe("refreshLspMaintenance diagnostic evidence", () => {
  it("does not resynchronize a provisional stale-module error", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-provisional-"));
    const file = path.join(tmpDir, "src", "a.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export {};\n");
    const evidence = {
      requested: 1,
      confirmed: 0,
      unconfirmed: 1,
      failed: 0,
      removed: 0,
      documents: [{ file: "src/a.ts", status: "unconfirmed" as const }],
    };
    const runtime = makeRuntime({
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(evidence),
      getOutstandingDiagnostics: vi.fn().mockReturnValue({
        entries: [
          {
            file: "src/a.ts",
            diagnostics: [
              {
                severity: 1,
                message: "Cannot find module 'pending'",
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 1 },
                },
              },
            ],
          },
        ],
        current: false,
        evidence,
      }),
    });

    await runMaintenance(runtime, tmpDir, createMaintenanceState());

    expect(runtime.closeFile).not.toHaveBeenCalled();
    expect(runtime.trackFile).not.toHaveBeenCalled();
    expect(runtime.refreshOpenDiagnostics).toHaveBeenCalledTimes(1);
  });
});

describe("refreshLspMaintenance source discovery", () => {
  it("tracks a source file created after the first pass", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-track-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }');
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const ok = true;\n");
    const runtime = makeRuntime();

    // Priming pass establishes the baseline; nothing is tracked.
    let state = createMaintenanceState();
    state = (await runMaintenance(runtime, tmpDir, state, { scope: tmpDir, trackSources: true }))
      .maintenanceState;
    expect(runtime.trackFile).not.toHaveBeenCalled();

    // Create a file after the baseline; the next pass must track it.
    fs.writeFileSync(path.join(tmpDir, "late.ts"), "export const late = true;\n");
    state = (await runMaintenance(runtime, tmpDir, state, { scope: tmpDir, trackSources: true }))
      .maintenanceState;

    expect(runtime.bulkTrackFiles).toHaveBeenCalledTimes(1);
    expect(runtime.trackFile).toHaveBeenCalledWith(path.join(tmpDir, "late.ts"));
  });

  it("continues diagnostic refresh when source discovery is limited", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-limited-"));
    const evidence = {
      requested: 1,
      confirmed: 1,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
      documents: [{ file: "existing.ts", status: "confirmed" as const }],
    };
    const runtime = makeRuntime({
      scanWorkspaceSources: vi.fn().mockResolvedValue({
        status: "limited",
        reason: "filesystem-error",
        observedFileCount: 3,
        files: [],
      }),
      refreshOpenDiagnostics: vi.fn().mockResolvedValue(evidence),
    });
    const state = {
      ...createMaintenanceState(),
      sourceBaseline: new Set([path.join(tmpDir, "existing.ts")]),
    };

    const result = await runMaintenance(runtime, tmpDir, state, {
      scope: tmpDir,
      trackSources: true,
    });

    expect(result.sourceTracking).toMatchObject({
      status: "limited",
      reason: "filesystem-error",
      deferred: 0,
    });
    expect(runtime.refreshOpenDiagnostics).toHaveBeenCalledTimes(1);
    expect(result.maintenanceState.sourceBaseline).toBe(state.sourceBaseline);
  });

  it("does not track a created file that automatic source support excludes", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-excluded-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }');
    const runtime = makeRuntime({ isSupportedSourceFile: vi.fn().mockReturnValue(false) });
    let state = createMaintenanceState();
    state = (await runMaintenance(runtime, tmpDir, state, { scope: tmpDir, trackSources: true }))
      .maintenanceState;

    fs.writeFileSync(path.join(tmpDir, "late.ts"), "export const late = true;\n");
    await runMaintenance(runtime, tmpDir, state, { scope: tmpDir, trackSources: true });

    expect(runtime.isSupportedSourceFile).toHaveBeenCalledWith(path.join(tmpDir, "late.ts"));
    expect(runtime.bulkTrackFiles).toHaveBeenCalledWith([path.join(tmpDir, "late.ts")], undefined);
    expect(runtime.trackFile).not.toHaveBeenCalled();
  });

  it("does not track files outside the requested scope", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-scope-"));
    const a = path.join(tmpDir, "a");
    const b = path.join(tmpDir, "b");
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }');
    fs.writeFileSync(path.join(a, "existing.ts"), "export const ok = true;\n");
    const runtime = makeRuntime();

    let state = createMaintenanceState();
    state = (await runMaintenance(runtime, tmpDir, state, { scope: tmpDir, trackSources: true }))
      .maintenanceState;
    expect(runtime.trackFile).not.toHaveBeenCalled();

    fs.writeFileSync(path.join(a, "late.ts"), "export const late = true;\n");
    fs.writeFileSync(path.join(b, "other.ts"), "export const other = true;\n");

    // Scope to directory a only: b's creation must stay untracked.
    await runMaintenance(runtime, tmpDir, state, { scope: a, trackSources: true });

    expect(runtime.trackFile).toHaveBeenCalledTimes(1);
    expect(runtime.trackFile).toHaveBeenCalledWith(path.join(a, "late.ts"));
  });

  it("does not track when snapshot tracking is disabled", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-notrack-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }');
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const ok = true;\n");
    const runtime = makeRuntime();

    // File-scoped passes do not scan or track sources.
    const state = createMaintenanceState();
    await runMaintenance(runtime, tmpDir, state, { scope: tmpDir });
    fs.writeFileSync(path.join(tmpDir, "late.ts"), "export const late = true;\n");
    await runMaintenance(runtime, tmpDir, state, { scope: tmpDir });

    expect(runtime.scanWorkspaceSources).not.toHaveBeenCalled();
    expect(runtime.bulkTrackFiles).not.toHaveBeenCalled();
  });

  it("forwards sentinel changes and invalidates config fixes", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-invalid-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }');
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const ok = true;\n");
    const runtime = makeRuntime();
    let state = createMaintenanceState();

    // Priming pass settles the sentinel state; an unchanged pass must emit no
    // events and invalidate nothing.
    state = (await runMaintenance(runtime, tmpDir, state, { scope: tmpDir })).maintenanceState;
    mocks.invalidateConfig.mockClear();
    runtime.noteWorkspaceChanges.mockClear();
    state = (await runMaintenance(runtime, tmpDir, state, { scope: tmpDir })).maintenanceState;
    expect(mocks.invalidateConfig).not.toHaveBeenCalled();
    expect(runtime.noteWorkspaceChanges).not.toHaveBeenCalled();

    // A config change is forwarded and invalidated; a pure source change is not.
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }\n');
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const ok = 2;\n");
    await runMaintenance(runtime, tmpDir, state, { scope: tmpDir });

    expect(mocks.invalidateConfig).toHaveBeenCalledWith(path.join(tmpDir, "tsconfig.json"));
    const forwarded = runtime.noteWorkspaceChanges.mock.calls.flat()[0] as Array<{
      uri: string;
    }>;
    const forwardedNames = forwarded.map((event) => path.basename(event.uri));
    expect(forwardedNames).toContain("tsconfig.json");
    expect(forwardedNames).not.toContain("existing.ts");
  });
});
