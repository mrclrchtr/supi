import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { clearMockRuntime, registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-impact-"));
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "impact-ws" }, null, 2));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  clearMockRuntime();
});

async function resolveTargetId(pi: ReturnType<typeof createPiMock>): Promise<string> {
  const resolveTool = getTool(pi, "code_resolve");
  const resolveResult = (await resolveTool.execute(
    "impact-resolve",
    { file: "index.ts", line: 1, character: 14 },
    undefined,
    undefined,
    makeCtx({ cwd: tmpDir }),
  )) as {
    details?: {
      data?: { targets?: Array<{ targetId: string }> };
    };
  };

  const targetId = resolveResult.details?.data?.targets?.[0]?.targetId;
  expect(targetId).toBeDefined();
  return targetId as string;
}

describe("code_impact tool", () => {
  it("is registered as an active public tool", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_impact");
    expect(tool).toBeDefined();
    expect(tool.name).toBe("code_impact");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBeDefined();
  });

  it("has parameters matching the planned V2 schema", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_impact") as {
      parameters?: { properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("targetId");
    expect(props).toHaveProperty("change");
    expect(props).toHaveProperty("changedFiles");
    expect(props).toHaveProperty("baseRef");
    expect(props).toHaveProperty("includeTests");
    expect(props).toHaveProperty("maxResults");
  });

  it("runs impact analysis from a resolved targetId while keeping code_affected as a compatibility alias", async () => {
    writeFileSync(path.join(tmpDir, "index.ts"), "export const foo = 1;\n");
    registerMockProvider(tmpDir, {
      exports: async () => ({
        kind: "success" as const,
        data: [
          {
            name: "foo",
            kind: "const",
            startLine: 1,
            startCharacter: 14,
            endLine: 1,
            endCharacter: 17,
          },
        ],
      }),
      references: async () => [],
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const affectedTool = getTool(pi, "code_affected");
    expect(affectedTool).toBeDefined();

    const targetId = await resolveTargetId(pi);
    const impactTool = getTool(pi, "code_impact");
    const result = (await impactTool.execute(
      "impact-target-id",
      { targetId },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { confidence?: string; nextQueries?: string[] };
      };
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Impact");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.confidence).toBe("semantic");
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_brief")]),
      );
    }
  });

  it("accepts changedFiles with optional baseRef and includeTests without requiring an anchored target", async () => {
    writeFileSync(path.join(tmpDir, "src.ts"), "export const changed = true;\n");
    writeFileSync(
      path.join(tmpDir, "src.test.ts"),
      "import { changed } from './src';\nvoid changed;\n",
    );

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-changed-files",
      {
        changedFiles: ["src.ts"],
        baseRef: "main",
        includeTests: true,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { nextQueries?: string[] };
      };
    };

    expect(result.content[0].text).not.toContain("**Error");
    expect(result.content[0].text).toContain("Impact");
    expect(result.content[0].text).toContain("src.ts");
    expect(result.content[0].text).toContain("Likely Tests");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_brief")]),
      );
    }
  });

  it("returns an explicit insufficient-evidence result for change-only requests instead of heuristic guessing", async () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const impactTool = getTool(pi, "code_impact");

    const result = (await impactTool.execute(
      "impact-change-only",
      { change: "rename foo to bar" },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      content: Array<{ type: string; text: string }>;
      details?: {
        type: string;
        data?: { confidence?: string; nextQueries?: string[] };
      };
    };

    expect(result.content[0].text).toContain("insufficient evidence");
    expect(result.content[0].text).toContain("changedFiles");
    expect(result.content[0].text).not.toContain("heuristic");
    expect(result.details?.type).toBe("impact");
    if (result.details?.type === "impact") {
      expect(result.details.data?.confidence).toBe("unavailable");
      expect(result.details.data?.nextQueries).toEqual(
        expect.arrayContaining([expect.stringContaining("code_resolve")]),
      );
    }
  });

  it("keeps code_affected on the narrower target-based surface", () => {
    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);

    const tool = getTool(pi, "code_affected") as {
      parameters?: { properties?: Record<string, unknown> };
    };

    const props = tool.parameters?.properties;
    expect(props).toBeDefined();
    expect(props).not.toHaveProperty("change");
    expect(props).not.toHaveProperty("changedFiles");
    expect(props).not.toHaveProperty("baseRef");
    expect(props).not.toHaveProperty("includeTests");
  });
});
