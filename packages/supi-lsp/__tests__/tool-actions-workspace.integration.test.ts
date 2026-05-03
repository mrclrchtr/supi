// Integration tests for workspace_symbol, search, and symbol_hover actions.
// Requires typescript-language-server + tsserver on PATH.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { LspManager } from "../src/manager.ts";
import { executeAction } from "../src/tool-actions.ts";
import { hasCommand, waitFor } from "./integration-utils.ts";

const HAS_TS_LSP = hasCommand("typescript-language-server") && hasCommand("tsserver");

let tmpDir: string;
let goodFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-workspace-integration-"));

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
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function warmUpToolActionManager(manager: LspManager): Promise<void> {
  await manager.ensureFileOpen(goodFile);
  await waitFor(
    () =>
      executeAction(manager, {
        action: "hover",
        file: goodFile,
        line: 1,
        character: 17,
      }),
    (result) => result.includes("add"),
    { timeoutMs: 5_000, retryDelayMs: 100, label: "hover on 'add' symbol during warm-up" },
  );
}

describe.skipIf(!HAS_TS_LSP)("tool-actions workspace integration", () => {
  let manager: LspManager;

  beforeAll(async () => {
    const config = loadConfig(tmpDir);
    manager = new LspManager(config, tmpDir);
    await warmUpToolActionManager(manager);
  }, 20_000);

  afterAll(async () => {
    await manager.shutdownAll();
  });

  it("workspace_symbol: finds symbols by query", async () => {
    const result = await executeAction(manager, {
      action: "workspace_symbol",
      query: "add",
    });
    expect(result).toContain("add");
    expect(result).toContain("Workspace symbols");
  }, 10_000);

  it("workspace_symbol: reports empty query", async () => {
    const result = await executeAction(manager, {
      action: "workspace_symbol",
      query: "",
    });
    expect(result).toContain("query");
  });

  it("search: finds symbols via LSP", async () => {
    const result = await executeAction(manager, {
      action: "search",
      query: "add",
    });
    expect(result).toContain("add");
  }, 10_000);

  it("search: falls back to text search for unknown symbol", async () => {
    const result = await executeAction(manager, {
      action: "search",
      query: "nonexistent_symbol",
    });
    expect(result).toContain("No symbols or text matches found");
  }, 10_000);

  it("symbol_hover: returns hover for symbol by name", async () => {
    const result = await executeAction(manager, {
      action: "symbol_hover",
      symbol: "add",
    });
    expect(result).toContain("add");
  }, 10_000);

  it("symbol_hover: reports missing symbol", async () => {
    const result = await executeAction(manager, {
      action: "symbol_hover",
      symbol: "nonexistent_symbol",
    });
    expect(result).toContain("not found");
  }, 10_000);
});
