import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LspRuntimeController, type WorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { CapabilityAdapter } from "../../../../src/session/capability-adapter.ts";
import { WorkspaceCodeIntelligenceSession } from "../../../../src/session/session.ts";
import { codeHealthSpec } from "../../../../src/tool/code_health/spec.ts";
import { registerCodeIntelligenceTools } from "../../../../src/tool/register.ts";
import { writeIsolatedFixtureConfig } from "../../../helpers/public-lsp-config.ts";

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../../../../../supi-lsp/__tests__/fixtures/lsp-mixed-diagnostic-server.mjs",
);

function createCapability(runtime: WorkspaceLspRuntime): CapabilityAdapter {
  return {
    getProviderState: () => ({ kind: "unavailable", reason: "not used" }),
    getProvider: () => null,
    getSemanticProvider: () => null,
    getStructuralProvider: () => null,
    getLspRuntimeState: () => ({ kind: "ready", runtime }),
    getCapabilityStates: () => ({
      semantic: { kind: "ready" },
      structural: { kind: "unavailable", reason: "not used" },
    }),
    ensureSemanticReadiness: async () => ({ kind: "ready" }),
  };
}

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
    const session = new WorkspaceCodeIntelligenceSession(cwd, createCapability(runtime));
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
    expect(fileOutput).not.toContain("Tsconfig");
  });
});
