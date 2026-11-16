import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OutlineItem } from "../src/api.ts";
import { useSharedTreeSitterSession } from "./helpers/shared-session.ts";

const workspace = useSharedTreeSitterSession("supi-outline-nested-");

async function outline(file: string, source: string): Promise<OutlineItem[]> {
  writeFileSync(join(workspace.cwd, file), source);
  const result = await workspace.session.outline(file);
  expect(result.kind).toBe("success");
  return result.kind === "success" ? result.data : [];
}

function nestedNames(items: readonly OutlineItem[]): string[] {
  return items.flatMap((item) => [item.name, ...nestedNames(item.children ?? [])]);
}

describe("nested JavaScript and TypeScript outline declarations", () => {
  it("retains declarations below exported functions and classes", async () => {
    const items = await outline(
      "exported.ts",
      `export function outer() {
  function inner() {}
  class LocalClass { method() { function nestedMethod() {} } }
  interface LocalInterface {}
  type LocalType = string;
}
export class Container {
  method() {
    function methodNested() {}
    type MethodType = number;
  }
}
`,
    );

    const outer = items.find((item) => item.name === "outer");
    const container = items.find((item) => item.name === "Container");
    expect(outer).toBeDefined();
    expect(container).toBeDefined();
    expect(nestedNames(outer?.children ?? [])).toEqual(
      expect.arrayContaining([
        "inner",
        "LocalClass",
        "method",
        "nestedMethod",
        "LocalInterface",
        "LocalType",
      ]),
    );
    expect(nestedNames(container?.children ?? [])).toEqual(
      expect.arrayContaining(["method", "methodNested", "MethodType"]),
    );
  });

  it("retains declarations below exported JavaScript functions and classes", async () => {
    const items = await outline(
      "exported.js",
      `export function outer() { function inner() {} }\nexport class Container { method() { function nested() {} } }\n`,
    );
    expect(nestedNames(items)).toEqual(
      expect.arrayContaining(["outer", "inner", "Container", "method", "nested"]),
    );
  });

  it.each(["ts", "tsx", "js", "jsx"])(
    "retains named declarations inside .%s class fields",
    async (extension) => {
      const typeDeclaration = extension.startsWith("ts") ? "type Local = string;" : "";
      const items = await outline(
        `class-fields.${extension}`,
        `export class Container {
  handler = () => {
    function inner() {}
    ${typeDeclaration}
    const excludedBinding = 1;
  };
}
`,
      );
      const container = items.find((item) => item.name === "Container");
      const handler = container?.children?.find((item) => item.name === "handler");
      expect(handler?.kind).toBe("field-function");
      expect(handler?.children).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "inner", kind: "function" })]),
      );
      if (typeDeclaration) {
        expect(handler?.children).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "Local", kind: "type" })]),
        );
      }
      expect(nestedNames(items)).not.toContain("excludedBinding");
    },
  );

  it("retains declarations inside TypeScript namespaces and ambient modules", async () => {
    const items = await outline(
      "modules.ts",
      `namespace APIs {
  export function request() {}
  export namespace Internal {
    export interface Response {}
  }
}
declare module "ambient-package" {
  export function load(): void;
  interface AmbientType {}
}
`,
    );

    const names = nestedNames(items);
    expect(names).toEqual(
      expect.arrayContaining([
        "APIs",
        "request",
        "Internal",
        "Response",
        "ambient-package",
        "load",
        "AmbientType",
      ]),
    );
  });

  it("retains named declarations in function-valued bindings without indexing local bindings", async () => {
    const items = await outline(
      "function-values.ts",
      `const lexicalOwner = function () {
  const localBinding = () => { function hiddenLocalBinding() {} };
  function fromLexical() {}
  type LexicalType = string;
};
var variableOwner = () => {
  function fromVariable() {}
  interface VariableInterface {}
};
export const exportedOwner = () => { function fromExportedOwner() {} };
`,
    );

    const lexicalOwner = items.find((item) => item.name === "lexicalOwner");
    const variableOwner = items.find((item) => item.name === "variableOwner");
    const exportedOwner = items.find((item) => item.name === "exportedOwner");
    expect(lexicalOwner?.kind).toBe("function");
    expect(variableOwner?.kind).toBe("function");
    expect(nestedNames(lexicalOwner?.children ?? [])).toEqual(
      expect.arrayContaining(["fromLexical", "LexicalType", "hiddenLocalBinding"]),
    );
    expect(nestedNames(variableOwner?.children ?? [])).toEqual(
      expect.arrayContaining(["fromVariable", "VariableInterface"]),
    );
    expect(nestedNames(exportedOwner?.children ?? [])).toContain("fromExportedOwner");
    expect(nestedNames(items)).not.toContain("localBinding");
  });
});
