import { describe, expect, it, vi } from "vitest";
import { LspManager } from "../manager.ts";

function makeManager(): LspManager {
  return new LspManager({ servers: {} });
}

describe("bash parser initialization", () => {
  it("returns null when parser is not initialized", async () => {
    vi.resetModules();
    const { shouldSuggestLsp } = await import("../bash-guard.ts");
    const manager = makeManager();
    vi.spyOn(manager, "isSupportedSourceFile").mockReturnValue(true);

    expect(
      shouldSuggestLsp(
        'rg "MySymbol" packages/supi-lsp/lsp.ts',
        "find all references for MySymbol",
        manager,
      ),
    ).toBeNull();
  });

  it("retries parser initialization after a failed load", async () => {
    vi.resetModules();
    let loadCalls = 0;
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    vi.doMock("web-tree-sitter", () => {
      class FakeParser {
        static async init() {}
        setLanguage(_language: unknown) {}
      }

      return {
        Parser: FakeParser,
        Language: {
          load: async () => {
            loadCalls += 1;
            if (loadCalls === 1) throw new Error("boom");
            return {};
          },
        },
        Node: class {},
      };
    });

    try {
      const { initBashParser } = await import("../bash-guard.ts");
      await initBashParser();
      await initBashParser();

      expect(loadCalls).toBe(2);
      expect(stderrWrite).toHaveBeenCalledWith(
        expect.stringContaining("future sessions will retry"),
      );
    } finally {
      stderrWrite.mockRestore();
      vi.doUnmock("web-tree-sitter");
      vi.resetModules();
    }
  });
});
