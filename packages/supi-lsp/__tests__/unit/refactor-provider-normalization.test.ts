import type { RefactorResult } from "@mrclrchtr/supi-code-runtime/api";
import { describe, expect, it, vi } from "vitest";
import { createLspSemanticProvider } from "../../src/provider/lsp-semantic-provider.ts";
import type { WorkspaceLspRuntime } from "../../src/session/runtime-registry.ts";

function createMockLsp(overrides: Partial<WorkspaceLspRuntime>): WorkspaceLspRuntime {
  return {
    getOpenDocumentVersion: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as WorkspaceLspRuntime;
}

describe("LSP provider semantic edit normalization", () => {
  it("does not keep text edits beside a resource operation", async () => {
    const lsp = createMockLsp({
      rename: vi.fn().mockResolvedValue({
        documentChanges: [
          { kind: "create", uri: "file:///src/new.ts" },
          {
            textDocument: { uri: "file:///src/index.ts", version: null },
            edits: [
              {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
                newText: "unsafe subset",
              },
            ],
          },
        ],
      }),
    });
    const provider = createLspSemanticProvider(lsp);

    const result = (await provider.rename?.(
      "/src/index.ts",
      { line: 0, character: 0 },
      "newName",
    )) as RefactorResult;

    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") expect(result.reason).toContain("resource operation");
  });

  it("rejects command-bearing code actions as incomplete precise plans", async () => {
    const lsp = createMockLsp({
      codeActions: vi.fn().mockResolvedValue([
        {
          title: "Extract function",
          edit: {
            changes: {
              "file:///src/index.ts": [
                {
                  range: { start: { line: 2, character: 0 }, end: { line: 5, character: 0 } },
                  newText: "helper()",
                },
              ],
            },
          },
          command: { title: "Finish extract", command: "server.finishExtract" },
        },
      ]),
    });
    const provider = createLspSemanticProvider(lsp);

    const results = (await provider.codeActions?.("/src/index.ts", {
      line: 3,
      character: 0,
    })) as RefactorResult[];

    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe("unavailable");
  });
});
