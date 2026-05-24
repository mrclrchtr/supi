// Integration tests for workspace-symbol service actions.
// Requires typescript-language-server + tsserver on PATH.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/config.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { SessionLspService } from "../../src/session/service-registry.ts";
import { executeLookup, executeWorkspaceSymbols } from "../../src/tool/service-actions.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

const HAS_TS_LSP = hasCommand("typescript-language-server") && hasCommand("tsserver");

let tmpDir: string;
let goodFile: string;
let nestedFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-service-workspace-integration-"));

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
      include: ["*.ts"],
    }),
  );

  goodFile = path.join(tmpDir, "math.ts");
  fs.writeFileSync(
    goodFile,
    [
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
      "export const PI = 3.14159;",
      "",
    ].join("\n"),
  );

  const nestedRoot = path.join(tmpDir, "packages", "feature");
  fs.mkdirSync(path.join(nestedRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(nestedRoot, "tsconfig.json"),
    JSON.stringify({
      extends: "../../tsconfig.json",
      include: ["src/**/*.ts"],
    }),
  );
  nestedFile = path.join(nestedRoot, "src", "feature.ts");
  fs.writeFileSync(
    nestedFile,
    ["export function nestedFeature(): string {", "  return 'ok';", "}", ""].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function warmUpService(service: SessionLspService): Promise<void> {
  await waitFor(
    () =>
      executeLookup(service, tmpDir, {
        kind: "hover",
        file: goodFile,
        line: 1,
        character: 17,
      }),
    (result) => result.includes("add"),
    { timeoutMs: 5_000, retryDelayMs: 100, label: "hover on 'add' symbol during warm-up" },
  );
}

describe.skipIf(!HAS_TS_LSP)("service actions workspace integration", () => {
  let manager: LspManager;
  let service: SessionLspService;

  beforeAll(async () => {
    const config = loadConfig(tmpDir);
    manager = new LspManager(config, tmpDir);
    service = new SessionLspService(manager);
    await warmUpService(service);
  }, 20_000);

  afterAll(async () => {
    await manager.shutdownAll();
  });

  it("workspace symbols: finds symbols by query on a cold started client", async () => {
    const coldManager = new LspManager(loadConfig(tmpDir), tmpDir);
    const coldService = new SessionLspService(coldManager);
    try {
      await coldManager.startServerForRoot("typescript", tmpDir);
      const result = await executeWorkspaceSymbols(coldService, tmpDir, { query: "add" });
      expect(result).toContain("add");
      expect(result).toContain("Workspace symbols");
    } finally {
      await coldManager.shutdownAll();
    }
  }, 15_000);

  it("workspace symbols: warms nested project roots on a cold started client", async () => {
    const coldManager = new LspManager(loadConfig(tmpDir), tmpDir);
    const coldService = new SessionLspService(coldManager);
    try {
      await coldManager.startServerForRoot("typescript", tmpDir);
      const result = await executeWorkspaceSymbols(coldService, tmpDir, {
        query: "nestedFeature",
      });
      expect(result).toContain("nestedFeature");
      expect(result).toContain(path.relative(tmpDir, nestedFile));
    } finally {
      await coldManager.shutdownAll();
    }
  }, 20_000);

  it("workspace symbols: finds symbols by query", async () => {
    const result = await executeWorkspaceSymbols(service, tmpDir, { query: "add" });
    expect(result).toContain("add");
    expect(result).toContain("Workspace symbols");
  }, 10_000);

  it("workspace symbols: reports empty query", async () => {
    const result = await executeWorkspaceSymbols(service, tmpDir, { query: "" });
    expect(result).toContain("query");
  });

  it("workspace symbols: reports missing symbol", async () => {
    const result = await executeWorkspaceSymbols(service, tmpDir, {
      query: "nonexistent_symbol",
    });
    expect(result).toContain("No symbols found");
  }, 10_000);
});
