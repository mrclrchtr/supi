// Integration tests for LspManager — tests the server pool against real LSP.
// Requires typescript-language-server on PATH and typescript in workspace node_modules.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/config.ts";
import type { Diagnostic } from "../../src/config/types.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

// typescript-language-server resolves tsserver from the project root's
// node_modules. The test's temp project has no node_modules, so we write
// a supi config that passes tsserver.path via initialization options.
const TSSERVER = path.resolve(
  import.meta.dirname,
  "../../../../node_modules/typescript/lib/tsserver.js",
);

const HAS_TS_LSP = hasCommand("typescript-language-server") && fs.existsSync(TSSERVER);

let tmpDir: string;

async function waitForDiagnostics(
  manager: LspManager,
  filePath: string,
  maxSeverity: number,
): Promise<Diagnostic[]> {
  return waitFor(
    () => manager.syncFileAndGetDiagnostics(filePath, maxSeverity),
    (diagnostics) => diagnostics.length > 0,
    { timeoutMs: 10_000, retryDelayMs: 200, label: `diagnostics for ${path.basename(filePath)}` },
  );
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-manager-integration-"));

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
      include: ["*.ts"],
    }),
  );

  fs.writeFileSync(
    path.join(tmpDir, "valid.ts"),
    // biome-ignore lint/suspicious/noTemplateCurlyInString: TS fixture source code
    "export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n",
  );

  fs.writeFileSync(path.join(tmpDir, "broken.ts"), 'export const n: number = "string";\n');

  // Point typescript-language-server at the workspace's tsserver so the
  // temp project (which has no node_modules) still resolves TypeScript.
  const supiDir = path.join(tmpDir, ".pi", "supi");
  fs.mkdirSync(supiDir, { recursive: true });
  fs.writeFileSync(
    path.join(supiDir, "config.json"),
    JSON.stringify({
      lsp: {
        servers: {
          typescript: {
            initializationOptions: { tsserver: { path: TSSERVER } },
          },
        },
      },
    }),
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe.skipIf(!HAS_TS_LSP)("LspManager integration", () => {
  let manager: LspManager;

  beforeAll(() => {
    const config = loadConfig(tmpDir);
    manager = new LspManager(config, tmpDir);
    manager.setExcludePatterns([]);
  });

  afterAll(async () => {
    await manager.shutdownAll();
  });

  it("lazily spawns a client on first file interaction", async () => {
    const validFile = path.join(tmpDir, "valid.ts");
    const client = await manager.ensureFileOpen(validFile);

    expect(client).not.toBeNull();
    expect(client?.name).toBe("typescript");
    expect(client?.status).toBe("running");
  }, 15_000);

  it("reuses client for same server + root", async () => {
    const file1 = path.join(tmpDir, "valid.ts");
    const file2 = path.join(tmpDir, "broken.ts");

    const client1 = await manager.ensureFileOpen(file1);
    const client2 = await manager.ensureFileOpen(file2);

    expect(client1).toBe(client2);
  }, 10_000);

  it("returns null for unsupported file types", async () => {
    const txtFile = path.join(tmpDir, "readme.txt");
    fs.writeFileSync(txtFile, "just text");
    const client = await manager.ensureFileOpen(txtFile);
    expect(client).toBeNull();
  });

  it("syncs file and returns error diagnostics", async () => {
    const brokenFile = path.join(tmpDir, "broken.ts");
    const diags = await waitForDiagnostics(manager, brokenFile, 1);

    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d: Diagnostic) => d.severity === 1)).toBe(true);
  }, 15_000);

  it("returns no error diagnostics for valid file", async () => {
    const validFile = path.join(tmpDir, "valid.ts");
    const diags = await manager.syncFileAndGetDiagnostics(validFile, 1);
    expect(diags).toHaveLength(0);
  }, 10_000);

  it("includes warnings when severity threshold raised", async () => {
    const brokenFile = path.join(tmpDir, "broken.ts");
    const diagsErrors = await waitForDiagnostics(manager, brokenFile, 1);
    const diagsAll = await waitForDiagnostics(manager, brokenFile, 4);
    expect(diagsAll.length).toBeGreaterThanOrEqual(diagsErrors.length);
  }, 15_000);

  it("reports server status", () => {
    const status = manager.getStatus();
    expect(status.servers.length).toBeGreaterThan(0);

    const tsServer = status.servers.find((s) => s.name === "typescript");
    expect(tsServer).toBeDefined();
    expect(tsServer?.status).toBe("running");
    expect(tsServer?.root).toBe(tmpDir);
  });

  it("reports diagnostic summary", () => {
    const summary = manager.getDiagnosticSummary();
    // Should have at least one file with errors (broken.ts)
    const brokenEntry = summary.find((s) => s.file.includes("broken"));
    expect(brokenEntry).toBeDefined();
    expect(brokenEntry?.errors).toBeGreaterThan(0);
  });

  it("excludes files matching exclude patterns from diagnostic summary", () => {
    const summary = manager.getDiagnosticSummary();
    // Verify broken.ts is present before exclusion
    const beforeEntry = summary.find((s) => s.file.includes("broken"));
    expect(beforeEntry).toBeDefined();

    manager.setExcludePatterns(["broken.ts"]);
    try {
      const filtered = manager.getDiagnosticSummary();
      const brokenEntry = filtered.find((s) => s.file.includes("broken"));
      expect(brokenEntry).toBeUndefined();
    } finally {
      manager.setExcludePatterns([]);
    }
  });

  it("excludes files matching exclude patterns from outstanding diagnostics", () => {
    const outstanding = manager.getOutstandingDiagnosticSummary(4);
    const beforeEntry = outstanding.find((s) => s.file.includes("broken"));
    expect(beforeEntry).toBeDefined();

    manager.setExcludePatterns(["broken.ts"]);
    try {
      const filtered = manager.getOutstandingDiagnosticSummary(4);
      const brokenEntry = filtered.find((s) => s.file.includes("broken"));
      expect(brokenEntry).toBeUndefined();
    } finally {
      manager.setExcludePatterns([]);
    }
  });

  it("excludes files matching exclude patterns from coverage", () => {
    manager.setExcludePatterns(["broken.ts"]);
    try {
      const filtered = manager.getActiveCoverageSummary();
      const brokenEntry = filtered.find((c) => c.openFiles.some((f) => f.includes("broken")));
      expect(brokenEntry).toBeUndefined();
    } finally {
      manager.setExcludePatterns([]);
    }
  });

  it("shuts down all servers cleanly", async () => {
    await manager.shutdownAll();
    const status = manager.getStatus();
    expect(status.servers).toHaveLength(0);
  }, 10_000);
});
