import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { completedCodeQuery } from "@mrclrchtr/supi-code-runtime/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderGraphResult } from "../../../src/tool/code_graph/tui.ts";
import { registerCodeIntelligenceTools } from "../../../src/tool/register.ts";
import type { ToolResult } from "../../../src/ui/tui/common.ts";
import { sessionCache } from "../../helpers/execute-action.ts";
import { clearMockRuntime, registerMockProvider } from "../../helpers/register-mock-runtime.ts";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as never;
let cwd: string;
const artifacts: string[] = [];

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "graph-file-display-"));
  writeFileSync(join(cwd, "target.ts"), "function work() {}\n");
  writeFileSync(join(cwd, "uses.ts"), "work();".repeat(25));
  registerMockProvider(cwd, {
    references: async () =>
      completedCodeQuery(
        Array.from({ length: 25 }, (_, index) => ({
          uri: `file://${join(cwd, "uses.ts")}`,
          range: {
            start: { line: 0, character: index * 7 },
            end: { line: 0, character: index * 7 + 4 },
          },
        })),
      ),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  clearMockRuntime();
  for (const artifact of artifacts.splice(0))
    rmSync(dirname(artifact), { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

async function execute(maxResults: number): Promise<ToolResult> {
  const pi = createPiMock();
  registerCodeIntelligenceTools(pi as never, sessionCache.getOrCreate);
  const tool = getTool(pi, "code_graph") as {
    execute: (...args: unknown[]) => Promise<ToolResult>;
  };
  const result = await tool.execute(
    "graph-display",
    {
      target: { anchor: { file: "target.ts", line: 1, character: 10 } },
      maxResults,
    },
    undefined,
    undefined,
    makeCtx({ cwd }),
  );
  const artifact = result.details?.truncation?.fullOutputPath;
  if (artifact) artifacts.push(artifact);
  return result;
}

function render(result: ToolResult, expanded: boolean, width = 100): string {
  return renderGraphResult(result, { expanded, isPartial: false }, theme, undefined)
    .render(width)
    .join("\n");
}

describe("code_graph file display", () => {
  it("keeps valid evidence when the optional continuation file cannot be written", async () => {
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw new Error("Disk full");
    });
    const result = await execute(30);
    expect(result.content[0]?.text).toContain("L1:169");
    expect(result.details?.truncation?.fullOutputPath).toBeUndefined();
    expect(render(result, true)).toContain("full returned evidence file unavailable");
  });

  it("does not assign rows to a file from malformed group metadata", async () => {
    const result = await execute(3);
    const malformed = {
      ...result,
      details: {
        ...result.details,
        type: "graph",
        data: {
          ...result.details?.data,
          sections: [
            {
              rel: "references",
              source: "semantic",
              status: "complete",
              fileGroups: [null, { file: "wrong.ts", count: 3 }],
            },
          ],
        },
      },
    };
    expect(render(malformed, true)).not.toContain("wrong.ts");
    expect(render(malformed, true)).toContain("L1:15");
  });

  it("provides all returned evidence in a file without changing agent content", async () => {
    const result = await execute(30);
    expect(result.details?.truncation).toMatchObject({ truncated: false, displayTruncated: true });
    const file = result.details?.truncation?.fullOutputPath;
    expect(file).toBeDefined();
    const content = result.content[0]?.text;
    expect(content).toContain("L1:169");
    expect(readFileSync(file as string, "utf8")).toBe(content);
    expect(render(result, true)).not.toContain("L1:169");
    expect(render(result, true)).toContain("20 of 25 locations shown; 5 omitted");
    expect(render(result, true)).toContain(file);
    expect(render(result, true)).toContain("full returned evidence");
    expect(content).not.toContain(file);
  });

  it("groups exact site coordinates under one file heading", async () => {
    const result = await execute(3);
    const text = render(result, true);
    expect(text.match(/uses\.ts/g)).toHaveLength(1);
    expect(text).toContain("L1:1");
    expect(text).toContain("L1:8");
    expect(text).toContain("L1:15");
    expect(text).toContain("3 of 25 locations shown; 22 omitted");
    expect(result.details?.truncation?.fullOutputPath).toBeUndefined();
    for (const width of [40, 80, 120]) {
      const rows = render(result, true, width).split("\n");
      expect(rows.every((row) => row.length <= width)).toBe(true);
    }
  });
});
