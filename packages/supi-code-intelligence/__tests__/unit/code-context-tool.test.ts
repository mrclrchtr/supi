import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-context-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "ctx-ws" }, null, 2));
});

afterEach(() => {
  clearMockRuntime();
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSource(relPath: string, source: string): void {
  const absPath = path.join(tmpDir, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, source);
}

async function resolveTargetId(
  pi: ReturnType<typeof createPiMock>,
  file: string,
  line: number,
  character: number,
) {
  const resolveTool = getTool(pi, "code_resolve");
  const resolveResult = (await resolveTool.execute(
    "context-resolve",
    { file, line, character },
    undefined,
    undefined,
    makeCtx({ cwd: tmpDir }),
  )) as {
    details?: {
      type: string;
      data?: { targets?: Array<{ targetId: string }> };
    };
  };

  const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
  expect(targetId).toBeDefined();
  return targetId as string;
}

describe("code_context tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_context");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_context");
    expect(typeof tool.execute).toBe("function");
  });

  it("falls back to orientation-style output when task is omitted", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-no-task",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Project Brief");
  });

  it("renders a task-focused bundle for a resolved target", async () => {
    writeSource(
      "src/context.ts",
      [
        "export function contextTarget() { helper(); }",
        "export function helper() { return 1; }",
      ].join("\n"),
    );
    writeSource(
      "src/consumer-a.ts",
      "import { contextTarget } from './context';\ncontextTarget();\n",
    );
    writeSource(
      "src/consumer-b.ts",
      "import { contextTarget } from './context';\ncontextTarget();\n",
    );

    const calleesAtSpy = vi.fn(async (_file: string, _line: number, _character: number) => ({
      kind: "success" as const,
      data: {
        enclosingScope: { name: "contextTarget", startLine: 1, endLine: 1 },
        callees: [{ name: "helper", startLine: 1, endLine: 1 }],
      },
    }));

    registerMockProvider(tmpDir, {
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "src/consumer-a.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
        {
          uri: `file://${path.join(tmpDir, "src/consumer-b.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
      ],
      calleesAt: calleesAtSpy,
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-task-target",
      {
        task: "rename contextTarget safely",
        targetId,
        include: ["defs", "references", "callees"],
        maxResults: 2,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("rename contextTarget safely");
    expect(result.content[0].text).toContain("## Task Context");
    expect(result.content[0].text).toContain("## Definitions");
    expect(result.content[0].text).toContain("## References");
    expect(result.content[0].text).toContain("## Callees");
    expect(calleesAtSpy).toHaveBeenCalledWith(expect.any(String), 1, 17);
  });

  it("filters to requested sections and caps repeated entries deterministically", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");
    writeSource("src/consumer-a.ts", "contextTarget();\n");
    writeSource("src/consumer-b.ts", "contextTarget();\n");

    registerMockProvider(tmpDir, {
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "src/consumer-a.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
        {
          uri: `file://${path.join(tmpDir, "src/consumer-b.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 13 },
          },
        },
      ],
      calleesAt: async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "contextTarget", startLine: 1, endLine: 1 },
          callees: [{ name: "helper", startLine: 1, endLine: 1 }],
        },
      }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-filtered",
      {
        task: "check references only",
        targetId,
        include: ["references"],
        budget: "small",
        maxResults: 1,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## References");
    expect(result.content[0].text).not.toContain("## Callees");
    expect(result.content[0].text).toContain("consumer-a.ts");
    expect(result.content[0].text).not.toContain("consumer-b.ts");
  });

  it("calls out requested but unavailable docs and tests sections honestly", async () => {
    writeSource("src/context.ts", "export function contextTarget() { return 1; }\n");

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi, "src/context.ts", 1, 17);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "context-unavailable-sections",
      {
        task: "find surrounding guidance",
        targetId,
        include: ["docs", "tests"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0].text).toContain("## Docs");
    expect(result.content[0].text).toContain("No docs context found.");
    expect(result.content[0].text).toContain("## Tests");
    expect(result.content[0].text).toContain("No test context found.");
  });
});
