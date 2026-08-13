import * as path from "node:path";
import {
  configureDebugRegistry,
  getDebugEvents,
  resetDebugRegistry,
} from "@mrclrchtr/supi-core/debug";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TreeSitterRuntime } from "../../src/worker/runtime.ts";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "../fixtures");

afterEach(() => {
  resetDebugRegistry();
});

beforeEach(() => {
  configureDebugRegistry({ enabled: true, maxEvents: 20 });
});

describe("structural timing observations", () => {
  it("separates file read, content hash, and cold or repeated parse time", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);

    const cold = await runtime.parseFile("sample.ts");
    if (cold.kind === "success") cold.data.tree.delete();
    const repeated = await runtime.parseFile("sample.ts");
    if (repeated.kind === "success") repeated.data.tree.delete();

    const events = getDebugEvents({
      source: "tree-sitter",
      category: "structural.parse.timing",
    }).events;
    expect(events.map((event) => event.data)).toEqual([
      {
        operation: "parse",
        grammar: "typescript",
        parserState: "reused",
        outcome: "completed",
        cache: { state: "hit", retained: true, evictionCount: 0 },
        timing: {
          durationMs: expect.any(Number),
          phasesMs: {
            "file-read": expect.any(Number),
            "content-hash": expect.any(Number),
            "cache-lookup": expect.any(Number),
          },
        },
      },
      {
        operation: "parse",
        grammar: "typescript",
        parserState: "cold",
        outcome: "completed",
        cache: { state: "miss", retained: true, evictionCount: 0 },
        timing: {
          durationMs: expect.any(Number),
          phasesMs: {
            "file-read": expect.any(Number),
            "content-hash": expect.any(Number),
            "parser-setup": expect.any(Number),
            parse: expect.any(Number),
          },
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(FIXTURE_DIR);
    expect(JSON.stringify(events)).not.toContain("export function hello");
    runtime.dispose();
  });

  it("separates query compilation and execution time", async () => {
    const runtime = new TreeSitterRuntime(FIXTURE_DIR);

    const query = "(function_declaration name: (identifier) @fn-name)";
    await runtime.queryFile("sample.ts", query);
    await runtime.queryFile("sample.ts", query);

    const events = getDebugEvents({
      source: "tree-sitter",
      category: "structural.query.timing",
    }).events;
    expect(events).toEqual([
      expect.objectContaining({
        message: "Tree-sitter query completed",
        data: {
          operation: "query",
          grammar: "typescript",
          outcome: "completed",
          captureCount: 1,
          cache: { state: "hit", retained: true, evictionCount: 0 },
          timing: {
            durationMs: expect.any(Number),
            phasesMs: {
              "query-cache": expect.any(Number),
              "query-execution": expect.any(Number),
            },
          },
        },
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          cache: { state: "miss", retained: true, evictionCount: 0 },
          timing: {
            durationMs: expect.any(Number),
            phasesMs: {
              "query-compilation": expect.any(Number),
              "query-execution": expect.any(Number),
            },
          },
        }),
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("function_declaration");
    expect(JSON.stringify(events)).not.toContain("fn-name");
    runtime.dispose();
  });
});
