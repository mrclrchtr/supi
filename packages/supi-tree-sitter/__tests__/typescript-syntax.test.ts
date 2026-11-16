import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useSharedTreeSitterSession } from "./helpers/shared-session.ts";

const workspace = useSharedTreeSitterSession("supi-typescript-syntax-");

describe("TypeScript syntax completeness", () => {
  it.each(["ts", "tsx"])(
    "inspects a type-only star re-export in %s without recovery",
    async (extension) => {
      const file = `index.${extension}`;
      writeFileSync(join(workspace.cwd, file), 'export type * from "./api.ts";\n');
      const result = await workspace.session.nodeAt(file, 1, 8);
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.text).toBe("type");
    },
  );

  it.each(["ts", "tsx"])(
    "retains an import-type array in %s as a complete type",
    async (extension) => {
      const file = `entries.${extension}`;
      writeFileSync(join(workspace.cwd, file), 'let entries: import("node:fs").Dirent[];\n');
      const result = await workspace.session.query(file, "(array_type) @array");
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data).toEqual([
        expect.objectContaining({ nodeType: "array_type", text: 'import("node:fs").Dirent[]' }),
      ]);
    },
  );

  it.each(["ts", "tsx"])(
    "retains import types in generic calls in %s without recovery",
    async (extension) => {
      const file = `calls.${extension}`;
      writeFileSync(
        join(workspace.cwd, file),
        [
          'read<import("./api").Value>();',
          'read<typeof import("./api")>();',
          'read<import("./api").Value[]>();',
        ].join("\n"),
      );
      const result = await workspace.session.query(
        file,
        "(call_expression type_arguments: (type_arguments) @types)",
      );
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.map((capture) => capture.text)).toEqual([
        '<import("./api").Value>',
        '<typeof import("./api")>',
        '<import("./api").Value[]>',
      ]);
    },
  );

  it.each(["ts", "tsx"])(
    "retains import-type members with type arguments in %s without recovery",
    async (extension) => {
      const file = `generic-members.${extension}`;
      writeFileSync(
        join(workspace.cwd, file),
        [
          'let value: import("./api").Static<T>;',
          'let values: import("./api").Static<T>[] | null;',
          'function parse<T>(): { parsed: import("./api").Static<T> } | null { return null; }',
          'const cast = input as import("./api").Box<string>;',
        ].join("\n"),
      );
      const node = await workspace.session.nodeAt(file, 1, 5);
      expect(node.kind).toBe("success");
      const result = await workspace.session.query(file, "(type_arguments) @types");
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.map((capture) => capture.text)).toEqual(["<T>", "<T>", "<T>", "<string>"]);
    },
  );

  it.each(["ts", "tsx"])(
    "preserves dynamic imports and comparison expressions in %s",
    async (extension) => {
      const file = `expressions.${extension}`;
      writeFileSync(
        join(workspace.cwd, file),
        [
          'const loaded = import("./api");',
          'const comparison = left < import("./api").value;',
          'const typeComparison = left < typeof import("./api");',
        ].join("\n"),
      );
      const result = await workspace.session.query(
        file,
        "[(call_expression function: (import)) (binary_expression) (unary_expression)] @expression",
      );
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.map(({ nodeType, text }) => ({ nodeType, text }))).toEqual([
        { nodeType: "call_expression", text: 'import("./api")' },
        { nodeType: "binary_expression", text: 'left < import("./api").value' },
        { nodeType: "call_expression", text: 'import("./api")' },
        { nodeType: "binary_expression", text: 'left < typeof import("./api")' },
        { nodeType: "unary_expression", text: 'typeof import("./api")' },
        { nodeType: "call_expression", text: 'import("./api")' },
      ]);
    },
  );

  it("still reports a type-only star re-export with its required source missing", async () => {
    writeFileSync(join(workspace.cwd, "broken.ts"), "export type *;\n");
    const result = await workspace.session.nodeAt("broken.ts", 1, 8);
    expect(result.kind).toBe("partial");
    if (result.kind !== "partial") return;
    expect(result.errorRanges.length).toBeGreaterThan(0);
  });
});
