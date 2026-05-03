import { describe, expect, it, vi } from "vitest";
import { lookupNodeAt } from "../src/node-at.ts";
import type { TreeSitterRuntime } from "../src/runtime.ts";

type Point = { row: number; column: number };

interface TestNode {
  type: string;
  text: string;
  parent: TestNode | null;
  startPosition: Point;
  endPosition: Point;
}

function createRuntime(parseFile: (filePath: string) => Promise<unknown>): TreeSitterRuntime {
  return { parseFile } as unknown as TreeSitterRuntime;
}

describe("lookupNodeAt", () => {
  it("builds the result before deleting the tree", async () => {
    let deleted = false;
    const node = {
      get type() {
        return deleted ? "ERROR" : "identifier";
      },
      get text() {
        return deleted ? "ERROR" : "hello";
      },
      parent: null,
      get startPosition() {
        return deleted ? { row: 0, column: 0 } : { row: 0, column: 16 };
      },
      get endPosition() {
        return deleted ? { row: 0, column: 0 } : { row: 0, column: 21 };
      },
    } satisfies TestNode;
    const tree = {
      rootNode: { descendantForPosition: () => node },
      delete: vi.fn(() => {
        deleted = true;
      }),
    };
    const runtime = createRuntime(
      vi.fn(async () => ({
        kind: "success",
        data: {
          tree,
          source: "export function hello() {}",
          resolvedPath: "sample.ts",
          grammarId: "typescript",
        },
      })),
    );

    const result = await lookupNodeAt(runtime, "sample.ts", 1, 17);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data.type).toBe("identifier");
      expect(result.data.text).toBe("hello");
    }
    expect(tree.delete).toHaveBeenCalledOnce();
  });

  it("caps ancestry at ten entries", async () => {
    const parents = createParentChain(12);
    const leaf: TestNode = {
      type: "identifier",
      text: "hello",
      parent: parents[0] ?? null,
      startPosition: { row: 0, column: 16 },
      endPosition: { row: 0, column: 21 },
    };
    const tree = {
      rootNode: { descendantForPosition: () => leaf },
      delete: vi.fn(),
    };
    const runtime = createRuntime(
      vi.fn(async () => ({
        kind: "success",
        data: {
          tree,
          source: "export function hello() {}",
          resolvedPath: "sample.ts",
          grammarId: "typescript",
        },
      })),
    );

    const result = await lookupNodeAt(runtime, "sample.ts", 1, 17);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data.ancestry).toHaveLength(10);
      expect(result.data.ancestry[0]?.type).toBe("parent0");
      expect(result.data.ancestry[9]?.type).toBe("parent9");
    }
    expect(tree.delete).toHaveBeenCalledOnce();
  });

  it("returns validation errors for invalid coordinates without parsing", async () => {
    const parseFile = vi.fn(async () => undefined);
    const runtime = createRuntime(parseFile);

    const lineResult = await lookupNodeAt(runtime, "sample.ts", 1.5, 1);
    const characterResult = await lookupNodeAt(runtime, "sample.ts", 1, 1.5);

    expect(lineResult.kind).toBe("validation-error");
    expect(characterResult.kind).toBe("validation-error");
    expect(parseFile).not.toHaveBeenCalled();
  });
});

function createParentChain(count: number): TestNode[] {
  const parents: TestNode[] = [];
  for (let index = 0; index < count; index++) {
    parents.push({
      type: `parent${index}`,
      text: "",
      parent: null,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 24 },
    });
  }
  for (let index = 0; index < parents.length - 1; index++) {
    const parent = parents[index];
    if (parent) parent.parent = parents[index + 1] ?? null;
  }
  return parents;
}
