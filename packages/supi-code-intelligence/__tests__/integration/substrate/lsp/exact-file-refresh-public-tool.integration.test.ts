import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
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

describe("registered exact-file health refresh outside automatic scope", () => {
  let root: string | undefined;
  let controller: LspRuntimeController | undefined;

  afterEach(async () => {
    await controller?.shutdown();
    controller = undefined;
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("retries a failed external alias route without losing the working canonical route", async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exact-file-retry-")));
    const cwd = path.join(root, "workspace");
    const external = path.join(root, "external");
    const alias = path.join(root, "alias");
    fs.mkdirSync(cwd);
    fs.mkdirSync(external);
    fs.symlinkSync(external, alias, "dir");
    fs.writeFileSync(path.join(external, "project.marker"), "");
    const file = path.join(external, "source.test");
    const aliasFile = path.join(alias, "source.test");
    fs.writeFileSync(file, "source\n");
    const gate = path.join(root, "can-start");
    const launcher = path.join(root, "launcher.mjs");
    fs.writeFileSync(
      launcher,
      `import { existsSync } from "node:fs";\nif (!existsSync(${JSON.stringify(gate)})) process.exit(1);\nawait import(${JSON.stringify(pathToFileURL(FIXTURE).href)});\n`,
    );
    writeIsolatedFixtureConfig(cwd, {
      args: [launcher, path.join(root, "server.log"), "1", "pull"],
      fileTypes: ["test"],
    });
    controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    expect(started.kind).toBe("ready");
    if (started.kind !== "ready") throw new Error("Fixture runtime unavailable");
    const pi = createPiMock();
    const session = new WorkspaceCodeIntelligenceSession(
      cwd,
      createPublicLspCapability(started.runtime),
    );
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeHealthSpec]);
    const health = getTool(pi, "code_health");
    const request = async (scope: string, refresh: boolean) => {
      const result = await health.execute(
        "retry",
        { scope, refresh, include: ["diagnostics", "servers"], level: "detailed" },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      return (result as { structuredContent: unknown }).structuredContent;
    };
    const failedStartup = "The routed LSP client could not be started for this file";
    expect(await request(aliasFile, false)).toMatchObject({
      diagnostics: { kind: "unavailable", reason: failedStartup },
      semanticState: { kind: "unavailable", reason: failedStartup },
    });
    const unsupported = path.join(external, "unsupported.supilive");
    fs.writeFileSync(unsupported, "unsupported route\n");
    for (const refresh of [false, true]) {
      const noRoute = "No compatible LSP server is configured for this file";
      expect(await request(unsupported, refresh)).toMatchObject({
        diagnostics: {
          kind: "unavailable",
          reason: noRoute,
          evidence: { confirmed: 0, failed: 1 },
        },
        semanticState: { kind: "unavailable", reason: noRoute },
        ...(refresh
          ? {
              refresh: {
                fileReadiness: "unavailable",
                startupRetry: { recoveredRoutes: 0, failedRoutes: 0, entries: [] },
              },
            }
          : {}),
      });
    }
    fs.writeFileSync(gate, "ready");
    expect(await request(file, false)).toMatchObject({
      diagnostics: { kind: "completed", evidence: { confirmed: 1 } },
    });
    expect(await request(aliasFile, true)).toMatchObject({
      diagnostics: {
        kind: "completed",
        scope: { path: file },
        evidence: { confirmed: 1, failed: 0 },
      },
      refresh: { fileReadiness: "ready", startupRetry: { recoveredRoutes: 1, failedRoutes: 0 } },
      servers: expect.arrayContaining([
        expect.objectContaining({ root: external, status: "running", ready: true }),
        expect.objectContaining({ root: alias, status: "running", ready: true }),
      ]),
    });
    expect(await request(file, true)).toMatchObject({
      diagnostics: { kind: "completed", evidence: { confirmed: 1, failed: 0 } },
      refresh: { fileReadiness: "ready", startupRetry: { recoveredRoutes: 0, failedRoutes: 0 } },
    });
  });

  it("refreshes an external file that already has confirmed diagnostic evidence", async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exact-file-refresh-")));
    const cwd = path.join(root, "workspace");
    const external = path.join(root, "external");
    fs.mkdirSync(cwd);
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, "project.marker"), "");
    const file = path.join(external, "source.test");
    fs.writeFileSync(file, "source\n");
    writeIsolatedFixtureConfig(cwd, {
      args: [FIXTURE, path.join(root, "server.log"), "1", "pull"],
      fileTypes: ["test"],
    });
    controller = new LspRuntimeController(cwd);
    const started = await controller.start();
    expect(started.kind).toBe("ready");
    if (started.kind !== "ready") throw new Error("Fixture runtime unavailable");
    const pi = createPiMock();
    const session = new WorkspaceCodeIntelligenceSession(
      cwd,
      createPublicLspCapability(started.runtime),
    );
    registerCodeIntelligenceTools(pi as never, () => session, undefined, [codeHealthSpec]);
    const health = getTool(pi, "code_health");
    for (const refresh of [false, true]) {
      const result = await health.execute(
        `external-${refresh}`,
        { scope: file, refresh, include: ["diagnostics", "servers"], level: "detailed" },
        undefined,
        undefined,
        makeCtx({ cwd }),
      );
      expect((result as { structuredContent: unknown }).structuredContent).toMatchObject({
        semanticState: { kind: "ready" },
        diagnostics: { kind: "completed", evidence: { requested: 1, confirmed: 1, failed: 0 } },
        ...(refresh ? { refresh: { kind: "completed", fileReadiness: "ready" } } : {}),
      });
    }
  });
});
