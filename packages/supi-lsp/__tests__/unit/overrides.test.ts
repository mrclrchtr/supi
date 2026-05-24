import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LspClient } from "../../src/client/client.ts";
import type { Diagnostic, Hover } from "../../src/config/types.ts";
import type { LspManager } from "../../src/manager/manager.ts";
import { registerLspAwareToolOverrides } from "../../src/tool/overrides.ts";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    severity: 1,
    source: "ts",
    message: "Cannot find name 'Foo'.",
    range: {
      start: { line: 0, character: 14 },
      end: { line: 0, character: 17 },
    },
    ...overrides,
  };
}

describe("registerLspAwareToolOverrides", () => {
  it("normalizes @ paths and augments primary diagnostics after write", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "supi-lsp-overrides-"));
    const absoluteFile = path.join(tempDir, "src", "index.ts");
    const hover: Hover = { contents: "Expected value imported from another module" };
    const client = {
      hover: vi.fn().mockResolvedValue(hover),
      codeActions: vi.fn().mockResolvedValue([{ title: "Add missing import" }]),
    } as unknown as LspClient;
    const manager = {
      getClientForFile: vi.fn().mockResolvedValue(client),
      syncFileAndGetCascadingDiagnostics: vi
        .fn()
        .mockResolvedValue([{ file: absoluteFile, diagnostics: [makeDiagnostic()] }]),
    } as unknown as LspManager;

    const pi = createPiMock();
    registerLspAwareToolOverrides(
      pi as unknown as Parameters<typeof registerLspAwareToolOverrides>[0],
      {
        getInlineSeverity: () => 1,
        getManager: () => manager,
        isActive: () => true,
      },
    );

    const writeTool = getTool(pi, "write");
    const result = (await writeTool.execute(
      "tc-1",
      { path: "@src/index.ts", content: "const value = Foo;\n" },
      undefined,
      undefined,
      makeCtx({ cwd: tempDir }),
    )) as {
      content: Array<{ type: "text"; text: string }>;
    };

    const output = result.content.map((entry) => entry.text).join("\n");

    expect(manager.syncFileAndGetCascadingDiagnostics).toHaveBeenCalledWith(absoluteFile, 2);
    expect(manager.getClientForFile).toHaveBeenCalledWith(absoluteFile);
    expect(output).toContain("Hover info");
    expect(output).toContain("Add missing import");
  });
});
