import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("web-tree-sitter");
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "tree-sitter-cancel-"));
  directories.push(directory);
  writeFileSync(join(directory, "sample.ts"), "export const value = 1;\n");
  return directory;
}

function tree() {
  return {
    rootNode: {},
    copy: vi.fn(() => tree()),
    delete: vi.fn(),
  };
}

describe("TreeSitterRuntime request cancellation", () => {
  it("resets an interrupted parser before reuse", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled during parse");
    const parserInstances: ParserMock[] = [];
    class ParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn();
      reset = vi.fn();
      setLanguage = vi.fn();
      parse = vi.fn((_source: string, _oldTree: unknown, options?: ProgressOptions) => {
        if (this.parse.mock.calls.length === 1) {
          controller.abort(cancellation);
          return options?.progressCallback?.({ currentOffset: 1 }) ? null : tree();
        }
        return tree();
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
    const { TreeSitterRuntime } = await import("../../src/worker/runtime.ts");
    const runtime = new TreeSitterRuntime(fixture());

    await expect(runtime.parseFile("sample.ts", { signal: controller.signal })).rejects.toBe(
      cancellation,
    );
    expect(parserInstances[0]?.reset).toHaveBeenCalledOnce();

    const repeated = await runtime.parseFile("sample.ts");
    expect(repeated.kind).toBe("success");
    if (repeated.kind === "success") repeated.data.tree.delete();
    expect(parserInstances).toHaveLength(1);
    expect(parserInstances[0]?.parse).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  it("does not reuse a discarded parser in a concurrent parse", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled with reset failure");
    const pendingReads: Array<(source: string) => void> = [];
    vi.doMock("node:fs/promises", () => ({
      realpath: vi.fn(async (filePath: string) => filePath),
      readFile: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            pendingReads.push(resolve);
          }),
      ),
    }));
    const parserInstances: Array<{
      delete: ReturnType<typeof vi.fn>;
      parse: ReturnType<typeof vi.fn>;
    }> = [];
    class ConcurrentParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn();
      reset = vi.fn(() => {
        throw new Error("reset failed");
      });
      setLanguage = vi.fn();
      parse = vi.fn((_source: string, _oldTree: unknown, options?: ProgressOptions) => {
        if (parserInstances[0] === this) {
          controller.abort(cancellation);
          return options?.progressCallback?.({ currentOffset: 1 }) ? null : tree();
        }
        return tree();
      });

      constructor() {
        parserInstances.push(this);
      }
    }
    vi.doMock("web-tree-sitter", () => ({
      Language: { load: vi.fn(async () => ({ id: "typescript" })) },
      Parser: ConcurrentParserMock,
      Query: class {},
    }));
    const { TreeSitterRuntime } = await import("../../src/worker/runtime.ts");
    const runtime = new TreeSitterRuntime("/project");

    const interrupted = runtime.parseFile("sample.ts", { signal: controller.signal });
    const concurrent = runtime.parseFile("sample.ts");
    await vi.waitFor(() => expect(pendingReads).toHaveLength(2));
    for (const finishRead of pendingReads) finishRead("export const value = 1;\n");

    await expect(interrupted).rejects.toBe(cancellation);
    const result = await concurrent;
    expect(result.kind).toBe("success");
    if (result.kind === "success") result.data.tree.delete();
    expect(parserInstances).toHaveLength(2);
    expect(parserInstances[0]?.delete).toHaveBeenCalledOnce();
    expect(parserInstances[1]?.parse).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("observes an absolute deadline during parser progress", async () => {
    const deadline = 100;
    let expired = false;
    vi.spyOn(Date, "now").mockImplementation(() => (expired ? deadline : deadline - 1));
    const parserInstances: Array<{ reset: ReturnType<typeof vi.fn> }> = [];
    class ParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn();
      reset = vi.fn();
      setLanguage = vi.fn();
      parse = vi.fn((_source: string, _oldTree: unknown, options?: ProgressOptions) => {
        expired = true;
        return options?.progressCallback?.({ currentOffset: 1 }) ? null : tree();
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
    const { CodeRequestDeadlineError } = await import("@mrclrchtr/supi-code-runtime/api");
    const { TreeSitterRuntime } = await import("../../src/worker/runtime.ts");
    const runtime = new TreeSitterRuntime(fixture());

    await expect(runtime.parseFile("sample.ts", { deadline })).rejects.toBeInstanceOf(
      CodeRequestDeadlineError,
    );
    expect(parserInstances[0]?.reset).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  it("stops query progress and allows a later query", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled during query");
    class ParserMock {
      static init = vi.fn(async () => undefined);
      delete = vi.fn();
      reset = vi.fn();
      setLanguage = vi.fn();
      parse = vi.fn(() => tree());
    }
    const queries: QueryMock[] = [];
    class QueryMock {
      delete = vi.fn();
      matches = vi.fn((_node: unknown, options?: ProgressOptions) => {
        if (queries[0] === this) {
          controller.abort(cancellation);
          options?.progressCallback?.({ currentOffset: 1 });
        }
        return [];
      });

      constructor() {
        queries.push(this);
      }
    }
    vi.doMock("web-tree-sitter", () => ({
      Language: { load: vi.fn(async () => ({ id: "typescript" })) },
      Parser: ParserMock,
      Query: QueryMock,
    }));
    const { TreeSitterRuntime } = await import("../../src/worker/runtime.ts");
    const runtime = new TreeSitterRuntime(fixture());

    await expect(
      runtime.queryFile("sample.ts", "(identifier) @id", { signal: controller.signal }),
    ).rejects.toBe(cancellation);
    const repeated = await runtime.queryFile("sample.ts", "(identifier) @id");

    expect(repeated).toEqual({ kind: "success", data: [] });
    expect(queries[0]?.delete).toHaveBeenCalledOnce();
    expect(queries).toHaveLength(2);
    runtime.dispose();
  });
});

interface ProgressOptions {
  progressCallback?: (state: { currentOffset: number }) => boolean;
}
