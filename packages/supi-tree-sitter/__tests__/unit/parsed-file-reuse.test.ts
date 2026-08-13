import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lookupCalleesAt } from "../../src/tool/callees.ts";
import { TreeSitterRuntime } from "../../src/worker/runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "parsed-file-reuse-"));
  configureDebugRegistry({ enabled: true, maxEvents: 50 });
});

afterEach(() => {
  resetDebugRegistry();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("TreeSitterRuntime parsed-file reuse", () => {
  it("returns independent owned trees and replaces changed content", async () => {
    const file = path.join(tmpDir, "sample.ts");
    writeFileSync(file, "export const value = 1;\n", "utf-8");
    const runtime = new TreeSitterRuntime(tmpDir);

    const first = await runtime.parseFile("sample.ts");
    expect(first.kind).toBe("success");
    if (first.kind !== "success") return;
    first.data.tree.delete();

    const repeated = await runtime.parseFile("sample.ts");
    expect(repeated.kind).toBe("success");
    if (repeated.kind !== "success") return;
    expect(repeated.data.source).toContain("value = 1");
    repeated.data.tree.delete();

    writeFileSync(file, "export const value = 2;\n", "utf-8");
    const changed = await runtime.parseFile("sample.ts");
    expect(changed.kind).toBe("success");
    if (changed.kind === "success") {
      expect(changed.data.source).toContain("value = 2");
      changed.data.tree.delete();
    }

    const events = getDebugEvents({
      source: "tree-sitter",
      category: "structural.parse.timing",
    }).events;
    expect(events.map((event) => event.data)).toEqual([
      expect.objectContaining({
        cache: { state: "replacement", retained: true, evictionCount: 0 },
      }),
      expect.objectContaining({ cache: { state: "hit", retained: true, evictionCount: 0 } }),
      expect.objectContaining({ cache: { state: "miss", retained: true, evictionCount: 0 } }),
    ]);
    expect(JSON.stringify(events)).not.toContain(tmpDir);
    expect(JSON.stringify(events)).not.toContain("value = 2");
    runtime.dispose();
  });

  it("records a sanitized eviction observation through baseline timing", async () => {
    const runtime = new TreeSitterRuntime(tmpDir);
    for (let index = 0; index < 129; index++) {
      const fileName = `fixture-${index}.ts`;
      writeFileSync(
        path.join(tmpDir, fileName),
        `export const value${index} = ${index};\n`,
        "utf-8",
      );
      const result = await runtime.parseFile(fileName);
      if (result.kind !== "success") throw new Error(`Fixture parse failed: ${result.message}`);
      result.data.tree.delete();
    }

    const events = getDebugEvents({
      source: "tree-sitter",
      category: "structural.parse.timing",
    }).events;
    expect(events[0]?.data).toEqual(
      expect.objectContaining({
        cache: { state: "miss", retained: true, evictionCount: 1 },
      }),
    );
    expect(JSON.stringify(events)).not.toContain(tmpDir);
    expect(JSON.stringify(events)).not.toContain("value128");
    runtime.dispose();
  });

  it("parses one unchanged file only once during structural callee lookup", async () => {
    writeFileSync(
      path.join(tmpDir, "calls.ts"),
      "export function run() { first(); second(); }\n",
      "utf-8",
    );
    const runtime = new TreeSitterRuntime(tmpDir);

    const result = await lookupCalleesAt(runtime, "calls.ts", 1, 20);

    expect(result.kind).toBe("success");
    const parseEvents = getDebugEvents({
      source: "tree-sitter",
      category: "structural.parse.timing",
    }).events;
    expect(parseEvents).toHaveLength(1);
    expect(parseEvents[0]?.data).toEqual(
      expect.objectContaining({ cache: { state: "miss", retained: true, evictionCount: 0 } }),
    );
    runtime.dispose();
  });
});
