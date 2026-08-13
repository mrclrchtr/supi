import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectDiagnostics,
  diagnosticScope,
} from "../../../../src/analysis/health/diagnostics.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "health-diagnostics-"));
  mkdirSync(path.join(cwd, "src"));
  writeFileSync(path.join(cwd, "src", "a.ts"), "export {};\n");
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function service(overrides: Record<string, unknown>): WorkspaceLspRuntime {
  return {
    fileDiagnostics: async () => ({ kind: "completed", data: [] }),
    getWorkspaceDiagnosticSummary: () => ({ entries: [], current: true }),
    ...overrides,
  } as unknown as WorkspaceLspRuntime;
}

describe("code_health diagnostic observations", () => {
  it("keeps a completed-empty file request distinct from unavailable collection", async () => {
    const file = path.join(cwd, "src", "a.ts");
    const observation = await collectDiagnostics({
      service: service({}),
      included: ["diagnostics"],
      scope: diagnosticScope(file),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toEqual({
      kind: "completed",
      scope: { kind: "file", path: file },
      entries: [],
    });
  });

  it("preserves partial file diagnostics and their reason", async () => {
    const file = path.join(cwd, "src", "a.ts");
    const observation = await collectDiagnostics({
      service: service({
        fileDiagnostics: async () => ({
          kind: "partial",
          data: [{ severity: 1 }],
          reason: "one provider failed",
        }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(file),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toEqual({
      kind: "partial",
      scope: { kind: "file", path: file },
      entries: [{ file, errors: 1, warnings: 0 }],
      reason: "one provider failed",
    });
  });

  it("keeps an unavailable file request from becoming an empty absence claim", async () => {
    const file = path.join(cwd, "src", "a.ts");
    const observation = await collectDiagnostics({
      service: service({
        fileDiagnostics: async () => ({ kind: "unavailable", reason: "route failed" }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(file),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toEqual({
      kind: "unavailable",
      scope: { kind: "file", path: file },
      entries: [],
      reason: "route failed",
    });
  });

  it("labels directory evidence as a filtered tracked-file snapshot", async () => {
    const src = path.join(cwd, "src");
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          current: true,
          entries: [
            { file: "src/a.ts", errors: 1, warnings: 0 },
            { file: "outside.ts", errors: 1, warnings: 0 },
          ],
        }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(src),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toEqual({
      kind: "completed",
      scope: { kind: "tracked-files", filter: src },
      entries: [{ file: path.join(cwd, "src", "a.ts"), errors: 1, warnings: 0 }],
    });
  });

  it("marks an invalidated empty tracked-file snapshot as partial", async () => {
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({ entries: [], current: false }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(null),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toEqual({
      kind: "partial",
      scope: { kind: "tracked-files", filter: null },
      entries: [],
      reason: "Some tracked-file diagnostics were invalidated by a workspace change.",
    });
  });
});
