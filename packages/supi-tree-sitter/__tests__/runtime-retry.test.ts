import { afterEach, describe, expect, it, vi } from "vitest";

describe("TreeSitterRuntime retry behavior", () => {
  afterEach(() => {
    vi.doUnmock("web-tree-sitter");
    vi.resetModules();
  });

  it("deletes a parser and retries after setLanguage fails", async () => {
    const parserInstances: ParserMock[] = [];
    class ParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn();
      parse = vi.fn(() => ({ delete: vi.fn(), rootNode: {} }));
      setLanguage = vi.fn((language: unknown) => {
        void language;
        if (parserInstances.length === 1) throw new Error("setLanguage failed");
      });

      constructor() {
        parserInstances.push(this);
      }
    }

    vi.doMock("web-tree-sitter", () => ({
      Language: { load: vi.fn(async () => ({ id: "typescript" })) },
      Parser: ParserMock,
      Query: class {},
    }));

    const { TreeSitterRuntime } = await import("../src/session/runtime.ts");
    const runtime = new TreeSitterRuntime("/tmp");

    await expect(runtime.ensureGrammarParser("typescript")).rejects.toThrow("setLanguage failed");
    expect(parserInstances[0]?.delete).toHaveBeenCalledOnce();

    await expect(runtime.ensureGrammarParser("typescript")).resolves.toBeTruthy();
    expect(parserInstances).toHaveLength(2);
  });

  it("retries parser initialization after init fails", async () => {
    let initAttempts = 0;
    class ParserMock {
      static init = vi.fn(async () => {
        initAttempts++;
        if (initAttempts === 1) throw new Error("init failed");
      });
      delete = vi.fn();
      setLanguage = vi.fn();
    }

    vi.doMock("web-tree-sitter", () => ({
      Language: { load: vi.fn(async () => ({ id: "typescript" })) },
      Parser: ParserMock,
      Query: class {},
    }));

    const { TreeSitterRuntime } = await import("../src/session/runtime.ts");
    const runtime = new TreeSitterRuntime("/tmp");

    await expect(runtime.ensureGrammarParser("typescript")).rejects.toThrow(
      "Failed to initialize web-tree-sitter",
    );
    await expect(runtime.ensureGrammarParser("typescript")).resolves.toBeTruthy();
    expect(initAttempts).toBe(2);
  });

  it("deletes a parser when disposal wins during grammar loading", async () => {
    let finishLoad: ((language: { id: string }) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const parserInstances: ParserMock[] = [];
    class ParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn();
      setLanguage = vi.fn();

      constructor() {
        parserInstances.push(this);
      }
    }

    vi.doMock("web-tree-sitter", () => ({
      Language: { load },
      Parser: ParserMock,
      Query: class {},
    }));

    const { TreeSitterRuntime } = await import("../src/session/runtime.ts");
    const runtime = new TreeSitterRuntime("/tmp");
    const pending = runtime.ensureGrammarParser("typescript");
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());

    runtime.dispose();
    finishLoad?.({ id: "typescript" });

    await expect(pending).rejects.toThrow("disposed");
    expect(parserInstances[0]?.delete).toHaveBeenCalledOnce();
  });

  it("continues parser cleanup when one parser delete fails", async () => {
    const parserInstances: ParserMock[] = [];
    class ParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn(() => {
        if (parserInstances[0] === this) throw new Error("delete failed");
      });
      setLanguage = vi.fn();

      constructor() {
        parserInstances.push(this);
      }
    }

    vi.doMock("web-tree-sitter", () => ({
      Language: { load: vi.fn(async (id: string) => ({ id })) },
      Parser: ParserMock,
      Query: class {},
    }));

    const { TreeSitterRuntime } = await import("../src/session/runtime.ts");
    const runtime = new TreeSitterRuntime("/tmp");
    await runtime.ensureGrammarParser("typescript");
    await runtime.ensureGrammarParser("javascript");

    expect(() => runtime.dispose()).not.toThrow();
    expect(parserInstances[0]?.delete).toHaveBeenCalledOnce();
    expect(parserInstances[1]?.delete).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent first-use grammar initialization", async () => {
    const parserInstances: ParserMock[] = [];
    const load = vi.fn(async () => {
      await Promise.resolve();
      return { id: "typescript" };
    });
    class ParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn();
      setLanguage = vi.fn();

      constructor() {
        parserInstances.push(this);
      }
    }

    vi.doMock("web-tree-sitter", () => ({
      Language: { load },
      Parser: ParserMock,
      Query: class {},
    }));

    const { TreeSitterRuntime } = await import("../src/session/runtime.ts");
    const runtime = new TreeSitterRuntime("/tmp");

    const [first, second] = await Promise.all([
      runtime.ensureGrammarParser("typescript"),
      runtime.ensureGrammarParser("typescript"),
    ]);

    expect(first).toBe(second);
    expect(load).toHaveBeenCalledOnce();
    expect(parserInstances).toHaveLength(1);
  });
});
