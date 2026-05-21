// Integration tests for service-backed LSP actions — end-to-end from SessionLspService to formatted output.
// Requires typescript-language-server + tsserver on PATH.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/config.ts";
import { LspManager } from "../../src/manager/manager.ts";
import { SessionLspService } from "../../src/session/service-registry.ts";
import {
  executeDiagnostics,
  executeDocumentSymbols,
  executeLookup,
  executeRefactor,
} from "../../src/tool/service-actions.ts";
import { hasCommand, waitFor } from "../helpers/integration-utils.ts";

const HAS_TS_LSP = hasCommand("typescript-language-server") && hasCommand("tsserver");

let tmpDir: string;
let goodFile: string;
let badFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-service-actions-integration-"));

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
      "export class Calculator {",
      "  sum(a: number, b: number): number {",
      "    return add(a, b);",
      "  }",
      "}",
      "",
    ].join("\n"),
  );

  badFile = path.join(tmpDir, "errors.ts");
  fs.writeFileSync(badFile, 'export const x: number = "not a number";\n');
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

describe.skipIf(!HAS_TS_LSP)("service actions integration", () => {
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

  it("hover: returns type info for a function", async () => {
    const result = await executeLookup(service, tmpDir, {
      kind: "hover",
      file: goodFile,
      line: 1,
      character: 17,
    });
    expect(result).toContain("add");
  }, 10_000);

  it("hover: reports no info for empty position", async () => {
    const result = await executeLookup(service, tmpDir, {
      kind: "hover",
      file: goodFile,
      line: 4,
      character: 1,
    });
    expect(result.toLowerCase()).toContain("no hover");
  }, 10_000);

  it("definition: finds function definition", async () => {
    const result = await executeLookup(service, tmpDir, {
      kind: "definition",
      file: goodFile,
      line: 9,
      character: 12,
    });
    expect(result).toContain("Definition");
    expect(result).toMatch(/:\d+:\d+/);
  }, 10_000);

  it("references: finds all references to a symbol", async () => {
    const result = await executeLookup(service, tmpDir, {
      kind: "references",
      file: goodFile,
      line: 1,
      character: 17,
    });
    expect(result).toContain("References");
    expect(result).toContain("math.ts");
  }, 10_000);

  it("document symbols: lists document symbols", async () => {
    const result = await executeDocumentSymbols(service, tmpDir, { file: goodFile });
    expect(result).toContain("add");
    expect(result).toContain("PI");
    expect(result).toContain("Calculator");
  }, 10_000);

  it("diagnostics: reports errors for broken file", async () => {
    const result = await waitFor(
      () => executeDiagnostics(service, tmpDir, { file: badFile }),
      (text) => text.toLowerCase().includes("error"),
      { timeoutMs: 10_000, retryDelayMs: 200, label: "diagnostics action for broken file" },
    );
    expect(result).toContain("error");
  }, 15_000);

  it("diagnostics: no errors for valid file", async () => {
    const result = await executeDiagnostics(service, tmpDir, { file: goodFile });
    const hasError = result.toLowerCase().includes("error") && !result.includes("No diagnostics");
    expect(hasError).toBe(false);
  }, 10_000);

  it("diagnostics: all-file summary when no file specified", async () => {
    await manager.syncFileAndGetDiagnostics(badFile, 1);

    const result = await waitFor(
      () => executeDiagnostics(service, tmpDir, {}),
      (text) => text.toLowerCase().includes("error"),
      { timeoutMs: 10_000, retryDelayMs: 200, label: "diagnostics summary action" },
    );
    expect(result).toContain("error");
  }, 15_000);

  it("rename: computes workspace-wide rename", async () => {
    const result = await executeRefactor(service, tmpDir, {
      kind: "rename",
      file: goodFile,
      line: 1,
      character: 17,
      newName: "addNumbers",
    });
    expect(result).toContain("addNumbers");
  }, 10_000);

  it("code actions: returns available actions", async () => {
    await manager.syncFileAndGetDiagnostics(badFile, 1);

    const result = await executeRefactor(service, tmpDir, {
      kind: "code_actions",
      file: badFile,
      line: 1,
      character: 1,
    });
    expect(typeof result).toBe("string");
  }, 10_000);

  it("returns error for unsupported file type", async () => {
    const txtFile = path.join(tmpDir, "readme.txt");
    fs.writeFileSync(txtFile, "just text");

    const result = await executeLookup(service, tmpDir, {
      kind: "hover",
      file: txtFile,
      line: 1,
      character: 1,
    });
    expect(result).toContain("No LSP server available");
  });

  it("returns validation error for missing parameters", async () => {
    const result = await executeLookup(service, tmpDir, {
      kind: "hover",
      file: goodFile,
      line: 1,
      character: undefined as unknown as number,
    });
    expect(result).toContain("Validation error");
  });
});
