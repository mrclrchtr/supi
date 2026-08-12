import { describe, expect, it, vi } from "vitest";
import type { Query, Tree } from "web-tree-sitter";
import {
  ParsedFileStore,
  type ParsedFileStoreLimits,
} from "../../src/session/parsed-file-store.ts";
import type { GrammarId } from "../../src/types.ts";

const DEFAULT_TEST_LIMITS: ParsedFileStoreLimits = {
  maxFileEntries: 2,
  maxSourceBytes: 1_024,
  maxQueryEntries: 2,
  maxQueryBytes: 1_024,
};

describe("ParsedFileStore parsed-file reuse", () => {
  it("uses canonical path, grammar, and content hash as freshness authority", async () => {
    const sources = new Map([["/real/file.ts", "const value = 1;"]]);
    const operations = createFileOperations(sources, () => "/real/file.ts");
    const store = new ParsedFileStore({ limits: DEFAULT_TEST_LIMITS, operations });
    const parsedTrees: FakeTree[] = [];
    const parse = vi.fn(() => makeTree(parsedTrees));

    const first = await acquire(store, "/alias-a.ts", "typescript", parse);
    const aliasHit = await acquire(store, "/alias-b.ts", "typescript", parse);
    const otherGrammar = await acquire(store, "/alias-b.ts", "javascript", parse);
    sources.set("/real/file.ts", "const value = 2;");
    const replacement = await acquire(store, "/alias-a.ts", "typescript", parse);

    expect(parse).toHaveBeenCalledTimes(3);
    expect(first.cache.state).toBe("miss");
    expect(aliasHit.cache.state).toBe("hit");
    expect(otherGrammar.cache.state).toBe("miss");
    expect(replacement.cache.state).toBe("replacement");
    expect(parsedTrees[0]?.delete).toHaveBeenCalledOnce();
    expect(first.tree).not.toBe(parsedTrees[0]);
    expect(aliasHit.tree).not.toBe(parsedTrees[0]);
    expect(first.tree).not.toBe(aliasHit.tree);

    deleteTrees(first.tree, aliasHit.tree, otherGrammar.tree, replacement.tree);
    store.dispose();
  });

  it("evicts the true least-recently-used file and reports entry eviction", async () => {
    const sources = new Map([
      ["/real/a.ts", "a"],
      ["/real/b.ts", "b"],
      ["/real/c.ts", "c"],
    ]);
    const store = new ParsedFileStore({
      limits: DEFAULT_TEST_LIMITS,
      operations: createFileOperations(sources),
    });
    const parsedTrees: FakeTree[] = [];
    const parse = () => makeTree(parsedTrees);

    const a = await acquire(store, "/real/a.ts", "typescript", parse);
    const b = await acquire(store, "/real/b.ts", "typescript", parse);
    const aHit = await acquire(store, "/real/a.ts", "typescript", parse);
    const c = await acquire(store, "/real/c.ts", "typescript", parse);

    expect(aHit.cache.state).toBe("hit");
    expect(c.cache).toEqual({ state: "miss", retained: true, evictionCount: 1 });
    expect(parsedTrees[0]?.delete).not.toHaveBeenCalled();
    expect(parsedTrees[1]?.delete).toHaveBeenCalledOnce();
    expect(parsedTrees[2]?.delete).not.toHaveBeenCalled();

    deleteTrees(a.tree, b.tree, aHit.tree, c.tree);
    store.dispose();
    expect(parsedTrees[0]?.delete).toHaveBeenCalledOnce();
    expect(parsedTrees[2]?.delete).toHaveBeenCalledOnce();
  });

  it("bounds retained files by UTF-8 source bytes", async () => {
    const sources = new Map([
      ["/real/a.ts", "1234"],
      ["/real/b.ts", "5678"],
      ["/real/large.ts", "123456789"],
    ]);
    const store = new ParsedFileStore({
      limits: { ...DEFAULT_TEST_LIMITS, maxFileEntries: 5, maxSourceBytes: 6 },
      operations: createFileOperations(sources),
    });
    const parsedTrees: FakeTree[] = [];
    const parse = () => makeTree(parsedTrees);

    const a = await acquire(store, "/real/a.ts", "typescript", parse);
    const b = await acquire(store, "/real/b.ts", "typescript", parse);
    const large = await acquire(store, "/real/large.ts", "typescript", parse);

    expect(b.cache).toEqual({ state: "miss", retained: true, evictionCount: 1 });
    expect(parsedTrees[0]?.delete).toHaveBeenCalledOnce();
    expect(large.cache).toEqual({ state: "miss", retained: false, evictionCount: 0 });
    expect(large.tree).toBe(parsedTrees[2]);
    expect(parsedTrees[1]?.delete).not.toHaveBeenCalled();
    expect(parsedTrees[2]?.delete).not.toHaveBeenCalled();

    deleteTrees(a.tree, b.tree, large.tree);
    store.dispose();
    expect(parsedTrees[1]?.delete).toHaveBeenCalledOnce();
  });

  it("deletes a redundant tree when concurrent parses publish the same content", async () => {
    const operations = createFileOperations(new Map([["/real/a.ts", "const a = 1;"]]));
    const store = new ParsedFileStore({ limits: DEFAULT_TEST_LIMITS, operations });
    const finishParses: Array<(tree: Tree) => void> = [];
    const parse = vi.fn(
      () =>
        new Promise<Tree>((resolve) => {
          finishParses.push(resolve);
        }),
    );
    const parsedTrees: FakeTree[] = [];

    const firstPending = acquire(store, "/real/a.ts", "typescript", parse);
    const secondPending = acquire(store, "/real/a.ts", "typescript", parse);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(2));
    finishParses[0]?.(makeTree(parsedTrees));
    const first = await firstPending;
    finishParses[1]?.(makeTree(parsedTrees));
    const second = await secondPending;

    expect(first.cache.state).toBe("miss");
    expect(second.cache.state).toBe("hit");
    expect(parsedTrees[0]?.delete).not.toHaveBeenCalled();
    expect(parsedTrees[1]?.delete).toHaveBeenCalledOnce();
    deleteTrees(first.tree, second.tree);
    store.dispose();
    expect(parsedTrees[0]?.delete).toHaveBeenCalledOnce();
  });

  it("deletes a parsed tree when disposal wins immediately before insertion", async () => {
    const operations = createFileOperations(new Map([["/real/a.ts", "const a = 1;"]]));
    const store = new ParsedFileStore({ limits: DEFAULT_TEST_LIMITS, operations });
    let finishParse: ((tree: Tree) => void) | undefined;
    const parse = vi.fn(
      () =>
        new Promise<Tree>((resolve) => {
          finishParse = resolve;
        }),
    );
    const parsedTrees: FakeTree[] = [];

    const pending = acquire(store, "/real/a.ts", "typescript", parse);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledOnce());
    store.dispose();
    finishParse?.(makeTree(parsedTrees));

    await expect(pending).rejects.toThrow("disposed");
    expect(parsedTrees[0]?.delete).toHaveBeenCalledOnce();
  });

  it("deletes a canonical tree when an owned copy cannot be made", async () => {
    const store = new ParsedFileStore({
      limits: DEFAULT_TEST_LIMITS,
      operations: createFileOperations(new Map([["/real/a.ts", "const a = 1;"]])),
    });
    const canonical = {
      copy: vi.fn(() => {
        throw new Error("copy failed");
      }),
      delete: vi.fn(),
    } as unknown as Tree;

    await expect(acquire(store, "/real/a.ts", "typescript", () => canonical)).rejects.toThrow(
      "copy failed",
    );
    expect(canonical.delete).toHaveBeenCalledOnce();
    store.dispose();
  });

  it("waits for asynchronous reads before parsing", async () => {
    let finishRead: ((source: string) => void) | undefined;
    const readFile = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishRead = resolve;
        }),
    );
    const parse = vi.fn(() => makeTree([]));
    const store = new ParsedFileStore({
      limits: DEFAULT_TEST_LIMITS,
      operations: {
        realpath: vi.fn(async (filePath) => filePath),
        readFile,
      },
    });

    const pending = acquire(store, "/real/a.ts", "typescript", parse);
    await vi.waitFor(() => expect(readFile).toHaveBeenCalledOnce());
    expect(parse).not.toHaveBeenCalled();
    finishRead?.("const a = 1;");
    const result = await pending;

    expect(parse).toHaveBeenCalledOnce();
    deleteTrees(result.tree);
    store.dispose();
  });
});

describe("ParsedFileStore compiled-query reuse", () => {
  it("reuses exact grammar and query text with true LRU eviction", () => {
    const store = new ParsedFileStore({ limits: DEFAULT_TEST_LIMITS });
    const compiled: FakeQuery[] = [];
    const compile = vi.fn(() => makeQuery(compiled));
    const execute = vi.fn((query: Pick<Query, "matches">) => query);

    const q1 = store.withQuery("typescript", "(identifier) @id", compile, execute);
    const q2 = store.withQuery("typescript", "(string) @value", compile, execute);
    const q1Hit = store.withQuery("typescript", "(identifier) @id", compile, execute);
    const q3 = store.withQuery("typescript", "(number) @value", compile, execute);

    expect(compile).toHaveBeenCalledTimes(3);
    expect(q1.cache.state).toBe("miss");
    expect(q2.cache.state).toBe("miss");
    expect(q1Hit.cache.state).toBe("hit");
    expect(q3.cache).toEqual({ state: "miss", retained: true, evictionCount: 1 });
    expect(compiled[0]?.delete).not.toHaveBeenCalled();
    expect(compiled[1]?.delete).toHaveBeenCalledOnce();
    expect(compiled[2]?.delete).not.toHaveBeenCalled();

    store.dispose();
    expect(compiled[0]?.delete).toHaveBeenCalledOnce();
    expect(compiled[2]?.delete).toHaveBeenCalledOnce();
  });

  it("uses true LRU order when the query-text byte limit evicts an entry", () => {
    const store = new ParsedFileStore({
      limits: { ...DEFAULT_TEST_LIMITS, maxQueryEntries: 5, maxQueryBytes: 6 },
    });
    const compiled: FakeQuery[] = [];
    const compile = () => makeQuery(compiled);
    const execute = (query: Pick<Query, "matches">) => query;

    store.withQuery("typescript", "aa", compile, execute);
    store.withQuery("typescript", "bbb", compile, execute);
    store.withQuery("typescript", "aa", compile, execute);
    const result = store.withQuery("typescript", "cccc", compile, execute);

    expect(result.cache).toEqual({ state: "miss", retained: true, evictionCount: 1 });
    expect(compiled[0]?.delete).not.toHaveBeenCalled();
    expect(compiled[1]?.delete).toHaveBeenCalledOnce();
    expect(compiled[2]?.delete).not.toHaveBeenCalled();
    store.dispose();
  });

  it("deletes an oversized transient query when execution fails", () => {
    const store = new ParsedFileStore({
      limits: { ...DEFAULT_TEST_LIMITS, maxQueryBytes: 1 },
    });
    const compiled: FakeQuery[] = [];

    expect(() =>
      store.withQuery(
        "typescript",
        "id",
        () => makeQuery(compiled),
        () => {
          throw new Error("execution failed");
        },
      ),
    ).toThrow("execution failed");
    expect(compiled[0]?.delete).toHaveBeenCalledOnce();
    store.dispose();
  });

  it("separates query entries by grammar and deletes an oversized transient query", () => {
    const store = new ParsedFileStore({
      limits: { ...DEFAULT_TEST_LIMITS, maxQueryBytes: 4 },
    });
    const compiled: FakeQuery[] = [];
    const compile = () => makeQuery(compiled);
    const execute = (query: Pick<Query, "matches">) => query;

    const ts = store.withQuery("typescript", "id", compile, execute);
    const js = store.withQuery("javascript", "id", compile, execute);
    const large = store.withQuery("typescript", "(identifier)", compile, execute);

    expect(ts.cache.state).toBe("miss");
    expect(js.cache.state).toBe("miss");
    expect(large.cache).toEqual({ state: "miss", retained: false, evictionCount: 0 });
    expect(compiled[2]?.delete).toHaveBeenCalledOnce();

    store.dispose();
    expect(compiled[0]?.delete).toHaveBeenCalledOnce();
    expect(compiled[1]?.delete).toHaveBeenCalledOnce();
  });
});

function createFileOperations(
  sources: Map<string, string>,
  canonicalize: (filePath: string) => string = (filePath) => filePath,
) {
  return {
    realpath: vi.fn(async (filePath: string) => canonicalize(filePath)),
    readFile: vi.fn(async (filePath: string) => {
      const source = sources.get(filePath);
      if (source === undefined) throw new Error(`Missing fixture ${filePath}`);
      return source;
    }),
  };
}

function acquire(
  store: ParsedFileStore,
  resolvedPath: string,
  grammarId: GrammarId,
  parse: (source: string) => Tree | Promise<Tree>,
) {
  return store.acquireParsedFile({ resolvedPath, grammarId, parse });
}

interface FakeTree {
  readonly id: number;
  readonly copy: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
}

function makeTree(collection: FakeTree[]): Tree {
  const tree: FakeTree = {
    id: collection.length,
    copy: vi.fn(() => makeOwnedTree()),
    delete: vi.fn(),
  };
  collection.push(tree);
  return tree as unknown as Tree;
}

function makeOwnedTree(): Tree {
  return {
    copy: vi.fn(() => makeOwnedTree()),
    delete: vi.fn(),
  } as unknown as Tree;
}

interface FakeQuery {
  readonly matches: ReturnType<typeof vi.fn>;
  readonly delete: ReturnType<typeof vi.fn>;
}

function makeQuery(collection: FakeQuery[]): Query {
  const query = { matches: vi.fn(() => []), delete: vi.fn() };
  collection.push(query);
  return query as unknown as Query;
}

function deleteTrees(...trees: Tree[]): void {
  for (const tree of trees) tree.delete();
}
