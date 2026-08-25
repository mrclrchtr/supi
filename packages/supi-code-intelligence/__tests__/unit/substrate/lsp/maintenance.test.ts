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

import { refreshLspMaintenance } from "../../../../src/substrate/lsp/maintenance.ts";

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

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    trackFile: vi.fn().mockResolvedValue(true),
    noteWorkspaceChanges: vi.fn(),
    refreshOpenDiagnostics: vi.fn().mockResolvedValue(emptyEvidence()),
    getOutstandingDiagnostics: vi.fn().mockReturnValue({ entries: [] }),
    getWorkspaceDiagnosticSummary: vi.fn().mockReturnValue({ evidence: emptyEvidence() }),
    closeFile: vi.fn(),
    pruneMissingFiles: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

/** Run maintenance and copy the returned snapshot back, like the session state sync. */
async function runMaintenance(
  runtime: unknown,
  cwd: string,
  snapshot: Map<string, number>,
  options: { scope?: string | null; trackSources?: boolean } = {},
) {
  const result = await refreshLspMaintenance(runtime as never, cwd, snapshot, options);
  snapshot.clear();
  for (const [key, value] of result.snapshot) snapshot.set(key, value);
  return result;
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

    await runMaintenance(runtime, tmpDir, new Map());

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
    await runMaintenance(runtime, tmpDir, new Map(), { scope: tmpDir, trackSources: true });
    const sentinelSnapshot = new Map<string, number>();
    await runMaintenance(runtime, tmpDir, sentinelSnapshot, {
      scope: tmpDir,
      trackSources: true,
    });
    expect(runtime.trackFile).not.toHaveBeenCalled();

    // Create a file after the baseline; the next pass must track it.
    fs.writeFileSync(path.join(tmpDir, "late.ts"), "export const late = true;\n");
    await runMaintenance(runtime, tmpDir, sentinelSnapshot, {
      scope: tmpDir,
      trackSources: true,
    });

    expect(runtime.trackFile).toHaveBeenCalledTimes(1);
    expect(runtime.trackFile).toHaveBeenCalledWith(path.join(tmpDir, "late.ts"));
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

    const sentinelSnapshot = new Map<string, number>();
    await runMaintenance(runtime, tmpDir, sentinelSnapshot, {
      scope: tmpDir,
      trackSources: true,
    });
    expect(runtime.trackFile).not.toHaveBeenCalled();

    fs.writeFileSync(path.join(a, "late.ts"), "export const late = true;\n");
    fs.writeFileSync(path.join(b, "other.ts"), "export const other = true;\n");

    // Scope to directory a only: b's creation must stay untracked.
    await runMaintenance(runtime, tmpDir, sentinelSnapshot, {
      scope: path.join(a),
      trackSources: true,
    });

    expect(runtime.trackFile).toHaveBeenCalledTimes(1);
    expect(runtime.trackFile).toHaveBeenCalledWith(path.join(a, "late.ts"));
  });

  it("does not track when snapshot tracking is disabled", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-notrack-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }');
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const ok = true;\n");
    const runtime = makeRuntime();

    // File-scoped passes widen the snapshot for priming but never track.
    const sentinelSnapshot = new Map<string, number>();
    await runMaintenance(runtime, tmpDir, sentinelSnapshot, { scope: tmpDir });
    fs.writeFileSync(path.join(tmpDir, "late.ts"), "export const late = true;\n");
    await runMaintenance(runtime, tmpDir, sentinelSnapshot, { scope: tmpDir });

    expect(runtime.trackFile).not.toHaveBeenCalled();
  });

  it("forwards sentinel changes and invalidates config fixes", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-maint-invalid-"));
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }');
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const ok = true;\n");
    const runtime = makeRuntime();
    const snapshot = new Map<string, number>();

    // Priming pass settles the baseline and clears the spy state; an
    // unchanged pass must emit no events and invalidate nothing.
    await runMaintenance(runtime, tmpDir, snapshot, { scope: tmpDir });
    mocks.invalidateConfig.mockClear();
    runtime.noteWorkspaceChanges.mockClear();
    await runMaintenance(runtime, tmpDir, snapshot, { scope: tmpDir });
    expect(mocks.invalidateConfig).not.toHaveBeenCalled();
    expect(runtime.noteWorkspaceChanges).not.toHaveBeenCalled();

    // A config change is forwarded and invalidated; a pure source change is not.
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), '{ "include": ["**/*.ts"] }\n');
    fs.writeFileSync(path.join(tmpDir, "existing.ts"), "export const ok = 2;\n");
    await runMaintenance(runtime, tmpDir, snapshot, { scope: tmpDir });

    expect(mocks.invalidateConfig).toHaveBeenCalledWith(path.join(tmpDir, "tsconfig.json"));
    const forwarded = runtime.noteWorkspaceChanges.mock.calls.flat()[0] as Array<{
      uri: string;
    }>;
    const forwardedNames = forwarded.map((event) => path.basename(event.uri));
    expect(forwardedNames).toContain("tsconfig.json");
    expect(forwardedNames).not.toContain("existing.ts");
  });
});
