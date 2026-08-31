import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTreeSitterSession } from "../src/session/session.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "supi-callees-scope-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(fileName: string, source: string): void {
  writeFileSync(path.join(tmpDir, fileName), source, "utf-8");
}

describe("calleesAt scope names", () => {
  it("detects callees in a Java constructor", async () => {
    writeSource(
      "constructor.java",
      ["class Worker {", "  Worker() {", "    initialize();", "  }", "}"].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("constructor.java", 2, 5);
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.enclosingScope.name).toBe("Worker");
      expect(result.data.callees.map(({ name }) => name)).toEqual(["initialize"]);
    } finally {
      await session.dispose();
    }
  });

  it("uses the declared method name for a qualified C++ scope", async () => {
    writeSource("qualified.cpp", "void ns::run() { dependency(); }\n");
    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("qualified.cpp", 1, 10);
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.enclosingScope.name).toBe("run");
    } finally {
      await session.dispose();
    }
  });

  it("uses the assigned binding for a JavaScript arrow scope", async () => {
    writeSource("arrow.ts", ["const handle = () => {", "  dependency();", "};"].join("\n"));

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("arrow.ts", 2, 3);
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.enclosingScope.name).toBe("handle");
      expect(result.data.callees.map(({ name }) => name)).toEqual(["dependency"]);
    } finally {
      await session.dispose();
    }
  });

  it("uses the assigned binding for an R function scope", async () => {
    writeSource("assigned.r", ["handler <- function() {", "  dependency()", "}"].join("\n"));

    const session = createTreeSitterSession(tmpDir);
    try {
      const result = await session.calleesAt("assigned.r", 2, 3);
      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;
      expect(result.data.enclosingScope.name).toBe("handler");
      expect(result.data.callees.map(({ name }) => name)).toEqual(["dependency"]);
    } finally {
      await session.dispose();
    }
  });

  it("uses only direct JavaScript bindings for object members, fields, and assignments", async () => {
    writeSource(
      "members.ts",
      [
        "const handlers = {",
        "  onEvent: () => {",
        "    dependency();",
        "  },",
        "};",
        "class Worker {",
        "  onReady = () => {",
        "    initialize();",
        "  };",
        "}",
        "let assigned;",
        "assigned = () => {",
        "  cleanup();",
        "};",
      ].join("\n"),
    );

    const session = createTreeSitterSession(tmpDir);
    try {
      const objectMember = await session.calleesAt("members.ts", 3, 5);
      const classField = await session.calleesAt("members.ts", 8, 5);
      const assignment = await session.calleesAt("members.ts", 13, 3);

      expect(objectMember).toMatchObject({
        kind: "success",
        data: { enclosingScope: { name: "onEvent" }, callees: [{ name: "dependency" }] },
      });
      expect(classField).toMatchObject({
        kind: "success",
        data: { enclosingScope: { name: "onReady" }, callees: [{ name: "initialize" }] },
      });
      expect(assignment).toMatchObject({
        kind: "success",
        data: { enclosingScope: { name: "assigned" }, callees: [{ name: "cleanup" }] },
      });
    } finally {
      await session.dispose();
    }
  });

  it("falls back to anonymous for JavaScript and R callback functions", async () => {
    const javascript = "const result = items.map(() => dependency());";
    const r = "result <- lapply(items, function() dependency())";
    writeSource("callbacks.ts", javascript);
    writeSource("callbacks.r", r);

    const session = createTreeSitterSession(tmpDir);
    try {
      const javascriptResult = await session.calleesAt(
        "callbacks.ts",
        1,
        javascript.indexOf("dependency") + 1,
      );
      const rResult = await session.calleesAt("callbacks.r", 1, r.indexOf("dependency") + 1);

      expect(javascriptResult).toMatchObject({
        kind: "success",
        data: { enclosingScope: { name: "anonymous" }, callees: [{ name: "dependency" }] },
      });
      expect(rResult).toMatchObject({
        kind: "success",
        data: { enclosingScope: { name: "anonymous" }, callees: [{ name: "dependency" }] },
      });
    } finally {
      await session.dispose();
    }
  });
});
