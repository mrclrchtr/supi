import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LspRuntimeController } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { codeHealthSpec } from "../../../../src/tool/code_health/spec.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { createPublicLspCapability } from "../../../helpers/public-lsp-capability.ts";
import { writeIsolatedFixtureConfig } from "../../../helpers/public-lsp-config.ts";

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../../../../supi-lsp/__tests__/fixtures/lsp-mixed-diagnostic-server.mjs",
);

describe("mixed-language diagnostics through public code_health", () => {
  let cwd: string | undefined;
  let shutdown: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await shutdown?.();
    shutdown = undefined;
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    cwd = undefined;
  });

  it("keeps Python diagnostics in a directory refresh under a TypeScript config", async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-intelligence-mixed-language-"));
    const sourceDir = path.join(cwd, "src");
    const logPath = path.join(cwd, "server.log");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    fs.writeFileSync(path.join(sourceDir, "tsconfig.json"), '{"include":["*.ts"]}\n');
    fs.writeFileSync(path.join(sourceDir, "clean-a.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(sourceDir, "clean-b.ts"), "export const b = 2;\n");
    fs.writeFileSync(path.join(sourceDir, "probe.py"), "pass\n");
    fs.writeFileSync(logPath, "");
    writeIsolatedFixtureConfig(cwd, {
      args: [FIXTURE, logPath],
      fileTypes: ["ts", "py"],
    });

    const controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    shutdown = () => controller.shutdown();
    const runtime = started.runtime;
    const cleanA = path.join(sourceDir, "clean-a.ts");
    const cleanB = path.join(sourceDir, "clean-b.ts");
    const python = path.join(sourceDir, "probe.py");
    await expect(runtime.trackFile(cleanA)).resolves.toBe(true);
    await expect(runtime.trackFile(cleanB)).resolves.toBe(true);
    await expect(runtime.trackFile(python)).resolves.toBe(true);

    const pi = createPiMock();
    const session = new WorkspaceCodeIntelligenceSession(cwd, createPublicLspCapability(runtime));
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeHealthSpec]);
    const health = getTool(pi, "code_health");

    const directoryResult = await health.execute(
      "mixed-directory-health",
      { scope: sourceDir, include: ["diagnostics"], refresh: true, level: "detailed" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const directoryOutput = JSON.stringify(directoryResult);
    expect(directoryOutput).toContain("Python diagnostic under a TypeScript config.");
    expect(directoryOutput).toContain('"requested":3');
    expect(directoryOutput).toContain('"confirmed":3');
    expect(directoryOutput).toContain("tracked-file bound");

    const fileResult = await health.execute(
      "mixed-file-health",
      { scope: python, include: ["diagnostics"], refresh: true, level: "detailed" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const fileOutput = JSON.stringify(fileResult);
    expect(fileOutput).toContain("Python diagnostic under a TypeScript config.");
    expect(fileOutput).toContain("maintenance scope: file runtime");
    expect(fileOutput).toContain(
      "**Evidence scope**: live file diagnostic request for `src/probe.py`.",
    );
    expect(fileOutput).not.toContain("Tsconfig");
  });

  it("separates broad maintenance evidence from scoped diagnostic results", async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-intelligence-scope-labels-"));
    const sourceDir = path.join(cwd, "src");
    const inside = path.join(sourceDir, "inside.ts");
    const clean = path.join(sourceDir, "clean.ts");
    const outside = path.join(cwd, "outside.ts");
    const logPath = path.join(cwd, "server.log");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    fs.writeFileSync(path.join(sourceDir, "tsconfig.json"), '{"include":["*.ts"]}\n');
    fs.writeFileSync(inside, "export const inside = 1;\n");
    fs.writeFileSync(clean, "export const clean = 1;\n");
    fs.writeFileSync(outside, "export const outside = 1;\n");
    fs.writeFileSync(logPath, "");
    writeIsolatedFixtureConfig(cwd, {
      args: [FIXTURE, logPath],
      fileTypes: ["ts", "py"],
    });

    const controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    shutdown = () => controller.shutdown();
    const runtime = started.runtime;
    await expect(runtime.trackFile(inside)).resolves.toBe(true);
    await expect(runtime.trackFile(clean)).resolves.toBe(true);
    await expect(runtime.trackFile(outside)).resolves.toBe(true);

    await expect(
      runtime.refreshOpenDiagnostics({ maxWaitMs: 2_000, quietMs: 1 }),
    ).resolves.toMatchObject({
      requested: 3,
      confirmed: 3,
      unconfirmed: 0,
      failed: 0,
      removed: 0,
    });

    const pi = createPiMock();
    const session = new WorkspaceCodeIntelligenceSession(cwd, createPublicLspCapability(runtime));
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeHealthSpec]);
    const health = getTool(pi, "code_health");

    const passiveResult = await health.execute(
      "passive-scoped-health",
      { scope: sourceDir, include: ["diagnostics"], refresh: false, level: "detailed" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const passiveOutput = JSON.stringify(passiveResult);
    expect(passiveOutput).toContain(
      "**Evidence scope**: tracked-file diagnostic snapshot under `src`.",
    );
    expect(passiveOutput).not.toContain("maintenance scope:");
    expect(passiveOutput).not.toContain("maintenance evidence:");

    const directoryResult = await health.execute(
      "scoped-directory-health",
      { scope: sourceDir, include: ["diagnostics"], refresh: true, level: "detailed" },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const directoryDetails = (directoryResult as { details: unknown }).details as {
      data: {
        refresh: {
          operationScope: string;
          requestedDiagnosticScope: { kind: string; filter: string | null };
          diagnosticEvidence?: {
            requested: number;
            confirmed: number;
            unconfirmed: number;
            failed: number;
            removed: number;
          };
        };
        diagnosticObservation: {
          scope: { kind: string; filter: string | null };
          evidence: {
            requested: number;
            confirmed: number;
            unconfirmed: number;
            failed: number;
            removed: number;
          };
          entries: Array<{ file: string; errors: number; warnings: number }>;
        };
      };
    };
    expect(directoryDetails.data.refresh).toMatchObject({
      operationScope: "workspace-runtime",
      requestedDiagnosticScope: { kind: "tracked-files", filter: sourceDir },
      diagnosticEvidence: {
        requested: 3,
        confirmed: 3,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
      },
    });
    expect(directoryDetails.data.diagnosticObservation).toMatchObject({
      scope: { kind: "tracked-files", filter: sourceDir },
      evidence: {
        requested: 2,
        confirmed: 2,
        unconfirmed: 0,
        failed: 0,
        removed: 0,
      },
      entries: [{ file: inside, errors: 1, warnings: 0 }],
    });
    expect(directoryDetails.data.diagnosticObservation.entries).toHaveLength(1);

    const directoryOutput = JSON.stringify(directoryResult);
    expect(directoryOutput).toContain(
      "maintenance scope: workspace runtime; maintenance evidence: 3 requested, 3 confirmed, 0 unconfirmed, 0 failed, 0 removed",
    );
    expect(directoryOutput).toContain(
      "**Evidence scope**: tracked-file diagnostic snapshot under `src`.",
    );
    expect(directoryOutput).toContain(
      "**Evidence coverage**: 2 requested, 2 confirmed, 0 unconfirmed, 0 failed, 0 removed (tracked-file bound).",
    );
    expect(directoryOutput).toContain("Inside directory diagnostic.");
    expect(directoryOutput).not.toContain("Outside directory diagnostic.");
    expect(directoryOutput).not.toContain("No errors or warnings are reported");

    const serverResult = await health.execute(
      "server-only-refresh",
      { scope: sourceDir, include: ["servers"], refresh: true },
      undefined,
      undefined,
      makeCtx({ cwd }),
    );
    const serverOutput = JSON.stringify(serverResult);
    expect(serverOutput).toContain("maintenance scope: workspace runtime");
    expect(serverOutput).toContain("maintenance evidence: 3 requested, 3 confirmed");
    expect(serverOutput).toContain("**Inventory scope**: workspace-wide.");
    expect(serverOutput).not.toContain("Evidence scope:");
  });
});
