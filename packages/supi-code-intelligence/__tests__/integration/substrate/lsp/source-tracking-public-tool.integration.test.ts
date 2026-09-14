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
  "../../../../../supi-lsp/__tests__/fixtures/lsp-semantic-server.mjs",
);

interface HealthDataRecord {
  readonly refresh: { readonly sourceTracking?: Record<string, unknown> };
  readonly diagnosticObservation: {
    readonly kind: string;
    readonly entries: readonly Record<string, unknown>[];
    readonly evidence: Record<string, number>;
  };
}

function healthData(result: unknown): HealthDataRecord {
  const details = (result as { details?: { data?: unknown } }).details;
  if (typeof details?.data !== "object" || details.data === null) {
    throw new Error("Expected structured code_health details.");
  }
  return details.data as HealthDataRecord;
}

function resultText(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content
    .filter((item) => item.type === "text" && item.text !== undefined)
    .map((item) => item.text)
    .join("\n");
}

describe("registered public code_health source tracking", () => {
  let cwd: string | undefined;
  let shutdown: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await shutdown?.();
    shutdown = undefined;
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    cwd = undefined;
  });

  it("reports a tsconfig-excluded JavaScript file as skipped, not unsupported", async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "code-intelligence-source-tracking-"));
    const baseline = path.join(cwd, "baseline.ts");
    const excluded = path.join(cwd, "excluded.js");
    const logPath = path.join(cwd, "server.log");
    fs.writeFileSync(path.join(cwd, "project.marker"), "");
    fs.writeFileSync(path.join(cwd, "tsconfig.json"), '{"include":["*.ts"]}\n');
    fs.writeFileSync(baseline, "export const baseline = true;\n");
    fs.writeFileSync(logPath, "");
    writeIsolatedFixtureConfig(cwd, {
      args: [FIXTURE, logPath, "10", "pull"],
      fileTypes: ["ts", "js"],
    });

    const controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    if (started.kind !== "ready") {
      throw new Error(`Fixture LSP did not start: ${started.kind}`);
    }
    shutdown = () => controller.shutdown();

    const pi = createPiMock();
    const session = new WorkspaceCodeIntelligenceSession(
      cwd,
      createPublicLspCapability(started.runtime),
    );
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeHealthSpec]);
    const health = getTool(pi, "code_health");
    const context = makeCtx({ cwd });

    const baselineResult = await health.execute(
      "source-baseline",
      { scope: cwd, include: ["diagnostics"], refresh: true, level: "detailed" },
      undefined,
      undefined,
      context,
    );
    expect(healthData(baselineResult).refresh.sourceTracking).toMatchObject({
      discovered: [],
      skipped: [],
      unavailable: [],
    });

    fs.writeFileSync(excluded, "const broken = ;\n");

    const exactResult = await health.execute(
      "excluded-file-health",
      { scope: excluded, include: ["diagnostics"], refresh: true, level: "detailed" },
      undefined,
      undefined,
      context,
    );
    const exactData = healthData(exactResult);
    expect(exactData.diagnosticObservation).toMatchObject({
      kind: "completed",
      entries: [{ file: excluded, errors: 1, warnings: 0 }],
      evidence: { requested: 1, confirmed: 1, unconfirmed: 0, failed: 0, removed: 0 },
    });
    expect(resultText(exactResult)).toContain("JavaScript syntax error.");

    const directoryResult = await health.execute(
      "directory-source-discovery",
      { scope: cwd, include: ["diagnostics"], refresh: true, level: "detailed" },
      undefined,
      undefined,
      context,
    );
    const directoryData = healthData(directoryResult);
    const sourceTracking = directoryData.refresh.sourceTracking;
    expect(sourceTracking).toMatchObject({
      discovered: ["excluded.js"],
      skipped: ["excluded.js"],
      unavailable: [],
      deferred: 0,
    });
    expect(sourceTracking).not.toHaveProperty("unsupported");
    expect(directoryData.diagnosticObservation).toMatchObject({
      kind: "completed",
      entries: [],
    });
    expect(resultText(directoryResult)).toContain("1 skipped");
    expect(resultText(directoryResult)).not.toContain("unsupported");
    expect(resultText(directoryResult).match(/source discovery/gi)).toHaveLength(1);
  });
});
