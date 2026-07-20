import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGraphTool } from "../../../../src/tool/graph/execute.ts";
import { makeTestCtx } from "../../../helpers/execute-action.ts";
import { registerMockProvider } from "../../../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-graph-locations-"));
  registerMockProvider(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("code_graph provider location completeness", () => {
  it("discloses invalid references without losing exact normalized totals", async () => {
    writeSource("test.ts", "export function foo() { return 1; }\n");
    writeSource("consumer-a.ts", "foo();\n");
    writeSource("consumer-b.ts", "foo();\n");
    registerMockProvider(tmpDir, {
      references: async () => [
        location(`file://${tmpDir}/consumer-a.ts`),
        location(`file://${tmpDir}/consumer-b.ts`),
        location(`file://${tmpDir}/bad%ZZ.ts`),
        location(""),
      ],
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "test.ts", line: 1, character: 17 } },
        maxResults: 1,
      },
      makeTestCtx(tmpDir),
    );

    expect(result.content).toContain(
      "2 invalid provider locations omitted (invalid-provider-location)",
    );
    expect(result.content).not.toContain("external reference");
    expectEvidenceMetadata(result, "references.locations", 2);
  });

  it("discloses invalid implementations without losing exact normalized totals", async () => {
    writeSource("test.ts", "interface Service { run(): void }\n");
    writeSource("implementation-a.ts", "class A implements Service { run() {} }\n");
    writeSource("implementation-b.ts", "class B implements Service { run() {} }\n");
    registerMockProvider(tmpDir, {
      implementation: async () => [
        location(`file://${tmpDir}/implementation-a.ts`, 0, 6),
        location(`file://${tmpDir}/implementation-b.ts`, 0, 6),
        location(`file://${tmpDir}/bad%ZZ.ts`, 0, 6),
      ],
    });

    const result = await executeGraphTool(
      {
        target: { anchor: { file: "test.ts", line: 1, character: 11 } },
        relations: ["implements"],
        maxResults: 1,
      },
      makeTestCtx(tmpDir),
    );

    expect(result.content).toContain(
      "1 invalid provider location omitted (invalid-provider-location)",
    );
    expect(result.content).not.toContain("outside this project");
    expectEvidenceMetadata(result, "implements.locations", 1);
  });
});

function writeSource(fileName: string, source: string): void {
  writeFileSync(path.join(tmpDir, fileName), source, "utf-8");
}

function location(uri: string, line = 0, character = 0) {
  return {
    uri,
    range: {
      start: { line, character },
      end: { line, character: character + 1 },
    },
  };
}

function expectEvidenceMetadata(
  result: Awaited<ReturnType<typeof executeGraphTool>>,
  key: string,
  invalidLocationCount: number,
): void {
  expect(result.details?.type).toBe("search");
  if (result.details?.type !== "search") return;
  expect(result.details.data.evidenceLists).toContainEqual({
    key,
    totalCount: 2,
    shownCount: 1,
    omittedCount: 1,
    partialReason: "invalid-provider-location",
    invalidLocationCount,
  });
}
