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

function emptyEvidence() {
  return {
    requested: 0,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
    documents: [],
  } as const;
}

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "health-diagnostics-"));
  mkdirSync(path.join(cwd, "src"));
  writeFileSync(path.join(cwd, "src", "a.ts"), "export {};\n");
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function service(overrides: Record<string, unknown>): WorkspaceLspRuntime {
  return {
    fileDiagnostics: async () => ({ kind: "completed", data: [] }),
    getWorkspaceDiagnosticSummary: () => ({
      entries: [],
      current: true,
      evidence: emptyEvidence(),
    }),
    getOutstandingDiagnostics: () => ({
      entries: [],
      current: true,
      evidence: emptyEvidence(),
    }),
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
      evidence: {
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [{ file, status: "confirmed" }],
      },
      scopeStatus: expect.objectContaining({
        status: "no-config",
        basis: null,
        configPath: null,
      }),
    });
  });

  it("reports failed evidence for an unavailable explicit file", async () => {
    const file = path.join(cwd, "src", "a.ts");
    const observation = await collectDiagnostics({
      service: null,
      included: ["diagnostics"],
      scope: diagnosticScope(file),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toMatchObject({
      kind: "unavailable",
      evidence: {
        requested: 1,
        confirmed: 0,
        unconfirmed: 0,
        failed: 1,
        removed: 0,
      },
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
      evidence: {
        requested: 1,
        confirmed: 0,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
        documents: [{ file, status: "unconfirmed" }],
      },
      reason: "one provider failed",
      scopeStatus: expect.objectContaining({
        status: "no-config",
        basis: null,
        configPath: null,
      }),
    });
  });

  it("maps tentative push unavailability to unconfirmed file evidence", async () => {
    const file = path.join(cwd, "src", "a.ts");
    const observation = await collectDiagnostics({
      service: service({
        fileDiagnostics: async () => ({
          kind: "unavailable",
          reason:
            "The current push publication is tentative: a later diagnostic republish for the same document synchronization is required.",
        }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(file),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toMatchObject({
      kind: "unavailable",
      entries: [],
      evidence: {
        requested: 1,
        confirmed: 0,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
        documents: [{ file, status: "unconfirmed" }],
      },
      reason: expect.stringContaining("diagnostic republish"),
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
      evidence: {
        requested: 1,
        confirmed: 0,
        unconfirmed: 0,
        failed: 1,
        removed: 0,
        documents: [{ file, status: "failed" }],
      },
      reason: "route failed",
      scopeStatus: expect.objectContaining({
        status: "no-config",
        basis: null,
        configPath: null,
      }),
    });
  });

  it("attaches the tsconfig scope decision for a post-parse file in a configured project", async () => {
    writeFileSync(path.join(cwd, "tsconfig.json"), '{"include":["src/**/*.ts"]}');
    writeFileSync(path.join(cwd, "src", "existing.ts"), "export {};\n");
    const existing = path.join(cwd, "src", "existing.ts");
    // Prime the cached parse before the post-parse file exists.
    await collectDiagnostics({
      service: service({}),
      included: ["diagnostics"],
      scope: diagnosticScope(existing),
      cwd,
      unavailableReason: "not ready",
    });
    const late = path.join(cwd, "src", "late.ts");
    writeFileSync(late, "export const late: number = 'x';\n");

    const observation = await collectDiagnostics({
      service: service({}),
      included: ["diagnostics"],
      scope: diagnosticScope(late),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toMatchObject({
      kind: "completed",
      scopeStatus: {
        status: "included",
        basis: "include-pattern",
        configPath: path.join(cwd, "tsconfig.json"),
      },
    });
  });

  it("labels directory evidence as a filtered tracked-file snapshot", async () => {
    const src = path.join(cwd, "src");
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          current: false,
          entries: [
            { file: "src/a.ts", errors: 1, warnings: 0 },
            { file: "outside.ts", errors: 1, warnings: 0 },
          ],
          evidence: {
            requested: 2,
            confirmed: 1,
            unconfirmed: 1,
            failed: 0,
            removed: 0,
            documents: [
              { file: "src/a.ts", status: "confirmed" },
              { file: "outside.ts", status: "unconfirmed" },
            ],
          },
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
      evidence: {
        requested: 1,
        confirmed: 1,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
        documents: [{ file: "src/a.ts", status: "confirmed" }],
      },
    });
  });

  it("keeps cached diagnostics without document evidence partial", async () => {
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          current: false,
          entries: [{ file: "src/a.ts", errors: 1, warnings: 0 }],
          evidence: {
            requested: 0,
            confirmed: 0,
            unconfirmed: 0,
            failed: 0,
            removed: 0,
            documents: [],
          },
        }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(null),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toMatchObject({
      kind: "partial",
      entries: [{ file: path.join(cwd, "src", "a.ts"), errors: 1, warnings: 0 }],
      evidence: { requested: 1, confirmed: 0, unconfirmed: 1 },
    });
  });

  it("reports exact mixed document coverage without widening a directory scope", async () => {
    const src = path.join(cwd, "src");
    const outside = path.join(cwd, "outside.ts");
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          current: false,
          entries: [{ file: "src/a.ts", errors: 1, warnings: 0 }],
          evidence: {
            requested: 3,
            confirmed: 1,
            unconfirmed: 1,
            failed: 1,
            removed: 0,
            documents: [
              { file: "src/a.ts", status: "confirmed" },
              { file: "src/b.ts", status: "unconfirmed" },
              { file: "outside.ts", status: "failed" },
            ],
          },
        }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(src),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toMatchObject({
      kind: "partial",
      scope: { kind: "tracked-files", filter: src },
      evidence: {
        requested: 2,
        confirmed: 1,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
      },
      reason:
        "Diagnostic evidence is partial: 2 requested, 1 confirmed, 1 unconfirmed, 0 failed, 0 removed. Unconfirmed documents await a later diagnostic republish before their evidence can be confirmed (ADR 0021).",
    });
    expect(JSON.stringify(observation)).not.toContain(outside);
  });

  it("does not call an empty stale snapshot clean", async () => {
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          entries: [],
          current: false,
          evidence: emptyEvidence(),
        }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(null),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toMatchObject({
      kind: "partial",
      evidence: emptyEvidence(),
      reason:
        "Diagnostic evidence is partial: 0 requested, 0 confirmed, 0 unconfirmed, 0 failed, 0 removed.",
    });
  });

  it("does not call a filtered stale snapshot clean without scoped evidence", async () => {
    const src = path.join(cwd, "src");
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          entries: [],
          current: false,
          evidence: emptyEvidence(),
        }),
      }),
      included: ["diagnostics"],
      scope: diagnosticScope(src),
      cwd,
      unavailableReason: "not ready",
    });

    expect(observation).toMatchObject({
      kind: "partial",
      evidence: emptyEvidence(),
      reason:
        "Diagnostic evidence is partial: 0 requested, 0 confirmed, 0 unconfirmed, 0 failed, 0 removed.",
    });
  });

  it("keeps tentative push diagnostics out of partial health evidence", async () => {
    // ADR 0021: a first push publication is tentative. The snapshot exposes
    // unconfirmed documents and no diagnostic entries, and the reason names
    // the republish requirement instead of inventing a tentative status.
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          current: true,
          entries: [],
          evidence: {
            requested: 1,
            confirmed: 0,
            unconfirmed: 1,
            failed: 0,
            removed: 0,
            documents: [{ file: "src/a.ts", status: "unconfirmed" }],
          },
        }),
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
      evidence: {
        requested: 1,
        confirmed: 0,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
        documents: [{ file: "src/a.ts", status: "unconfirmed" }],
      },
      reason:
        "Diagnostic evidence is partial: 1 requested, 0 confirmed, 1 unconfirmed, 0 failed, 0 removed. Unconfirmed documents await a later diagnostic republish before their evidence can be confirmed (ADR 0021).",
    });
  });

  it("marks an invalidated empty tracked-file snapshot as partial", async () => {
    const observation = await collectDiagnostics({
      service: service({
        getWorkspaceDiagnosticSummary: () => ({
          entries: [],
          current: false,
          evidence: {
            requested: 1,
            confirmed: 0,
            unconfirmed: 1,
            failed: 0,
            removed: 0,
            documents: [{ file: "src/a.ts", status: "unconfirmed" }],
          },
        }),
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
      evidence: {
        requested: 1,
        confirmed: 0,
        unconfirmed: 1,
        failed: 0,
        removed: 0,
        documents: [{ file: "src/a.ts", status: "unconfirmed" }],
      },
      reason:
        "Diagnostic evidence is partial: 1 requested, 0 confirmed, 1 unconfirmed, 0 failed, 0 removed. Unconfirmed documents await a later diagnostic republish before their evidence can be confirmed (ADR 0021).",
    });
  });
});
