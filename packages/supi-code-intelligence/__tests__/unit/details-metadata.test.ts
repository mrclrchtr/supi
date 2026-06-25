import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildArchitectureModel } from "@mrclrchtr/supi-code-intelligence/api";
import { createPiMock, getTool, makeCtx } from "@mrclrchtr/supi-test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateFocusedBrief, generateProjectBrief } from "../../src/brief.ts";
import codeIntelligenceExtension from "../../src/code-intelligence.ts";
import { executeContextTool } from "../../src/tool/execute-context.ts";
import { executePatternAction } from "../../src/use-case/generate-pattern.ts";
import { executeAction } from "../helpers/execute-action.ts";
import { registerMockProvider } from "../helpers/register-mock-runtime.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "code-intel-details-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJson(dir: string, file: string, data: unknown) {
  writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2));
}

function setupWorkspace() {
  writeJson(tmpDir, "package.json", { name: "ws", description: "Workspace" });
  writeFileSync(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

  const core = path.join(tmpDir, "packages", "core");
  mkdirSync(core, { recursive: true });
  writeJson(core, "package.json", { name: "@t/core", description: "Core" });
  writeFileSync(path.join(core, "index.ts"), "export const x = 1;");

  const app = path.join(tmpDir, "packages", "app");
  mkdirSync(app, { recursive: true });
  writeJson(app, "package.json", {
    name: "@t/app",
    dependencies: { "@t/core": "workspace:*" },
    pi: { extensions: ["./main.ts"] },
  });
  writeFileSync(path.join(app, "main.ts"), "export default function() {}");

  const cli = path.join(tmpDir, "packages", "cli");
  mkdirSync(cli, { recursive: true });
  writeJson(cli, "package.json", {
    name: "@t/cli",
    dependencies: { "@t/core": "workspace:*" },
  });
}

describe("project brief details metadata", () => {
  it("includes confidence mode", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.confidence).toBe("structural");
  });

  it("includes dependency summary", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.dependencySummary).not.toBeNull();
    expect(details.dependencySummary?.moduleCount).toBe(3);
    expect(details.dependencySummary?.edgeCount).toBeGreaterThanOrEqual(2);
  });

  it("includes start-here for highly depended modules", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    // core is depended on by app and cli => should appear in start-here
    expect(details.startHere.length).toBeGreaterThanOrEqual(1);
    const coreEntry = details.startHere.find((s) => s.target.includes("core"));
    expect(coreEntry).toBeDefined();
    expect(coreEntry?.reason).toContain("dependency");
  });

  it("includes public surfaces from entrypoints", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.publicSurfaces.length).toBeGreaterThan(0);
    const appSurface = details.publicSurfaces.find((s) => s.includes("app"));
    expect(appSurface).toBeDefined();
  });

  it("includes next queries", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = generateProjectBrief(model as NonNullable<typeof model>);
    expect(details.nextQueries.length).toBeGreaterThan(0);
  });
});

describe("focused brief details metadata", () => {
  it("includes confidence for module brief", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = await generateFocusedBrief(
      model as NonNullable<typeof model>,
      path.join(tmpDir, "packages", "core"),
    );
    expect(details.confidence).toBe("structural");
    expect(details.focusTarget).not.toBeNull();
  });

  it("includes dependency summary for module brief", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const appDir = path.join(tmpDir, "packages", "app");
    const { details } = await generateFocusedBrief(model as NonNullable<typeof model>, appDir);
    expect(details.dependencySummary).not.toBeNull();
    expect(details.dependencySummary?.moduleCount).toBe(1);
  });

  it("reports unavailable confidence for missing path", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const { details } = await generateFocusedBrief(
      model as NonNullable<typeof model>,
      "/does/not/exist",
    );
    expect(details.confidence).toBe("unavailable");
  });

  it("includes start-here for module with entrypoints", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const appDir = path.join(tmpDir, "packages", "app");
    const { details } = await generateFocusedBrief(model as NonNullable<typeof model>, appDir);
    expect(details.startHere.length).toBeGreaterThan(0);
    expect(details.startHere[0].reason).toContain("entrypoint");
  });

  it("includes next queries for module with dependents", async () => {
    setupWorkspace();
    const model = await buildArchitectureModel(tmpDir);
    const coreDir = path.join(tmpDir, "packages", "core");
    const { details } = await generateFocusedBrief(model as NonNullable<typeof model>, coreDir);
    expect(details.nextQueries.length).toBeGreaterThan(0);
    const impactHint = details.nextQueries.find((q) => q.includes("code_impact"));
    expect(impactHint).toBeDefined();
  });

  it("includes optional priority signals when artifacts exist", async () => {
    setupWorkspace();
    mkdirSync(path.join(tmpDir, "coverage"), { recursive: true });
    writeFileSync(
      path.join(tmpDir, "coverage", "coverage-summary.json"),
      JSON.stringify(
        {
          total: { lines: { pct: 95 }, statements: { pct: 95 } },
          "packages/core/index.ts": { lines: { pct: 10 }, statements: { pct: 10 } },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(tmpDir, "knip.json"),
      JSON.stringify({ exports: [{ file: "packages/core/index.ts", name: "x" }] }, null, 2),
    );

    const model = await buildArchitectureModel(tmpDir);
    const coreFile = path.join(tmpDir, "packages", "core", "index.ts");
    const { details } = await generateFocusedBrief(model as NonNullable<typeof model>, coreFile);

    expect(details.prioritySignals).not.toBeNull();
    expect(details.prioritySignals?.lowCoverageCount).toBe(1);
    expect(details.prioritySignals?.unusedCount).toBe(1);
  });
});

describe("structured details via tool adapters and action routers", () => {
  it("returns project-level orientation details when called without a target", async () => {
    setupWorkspace();
    const result = await executeContextTool({}, { cwd: tmpDir });
    expect(result.content).toContain("Project Brief");
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("context");
    if (result.details?.type === "context") {
      expect(result.details.data.confidence).toBe("structural");
      expect(result.details.data.focusTarget).toBeNull();
    }
  });

  it("returns pattern search details", async () => {
    writeFileSync(path.join(tmpDir, "a.ts"), "const foo = 1;");
    const result = await executePatternAction({ pattern: "foo" }, tmpDir);
    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("search");
  });

  it("returns undefined details for validation errors", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    const result = await executeAction({ action: "unknown" as any }, { cwd: tmpDir });
    expect(result.details).toBeUndefined();
    expect(result.content).toContain("Error");
  });

  describe("semantic actions — target resolution error returns details", () => {
    it("references target error returns search details with unavailable confidence", async () => {
      const result = await executeAction({ action: "graph" }, { cwd: tmpDir });
      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe("search");
      if (result.details?.type === "search") {
        expect(result.details.data.confidence).toBe("unavailable");
        expect(result.details.data.candidateCount).toBe(0);
      }
    });

    it("implementations target error returns search details with unavailable confidence", async () => {
      const result = await executeAction(
        { action: "graph", relations: ["implements"] },
        { cwd: tmpDir },
      );
      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe("search");
      if (result.details?.type === "search") {
        expect(result.details.data.confidence).toBe("unavailable");
      }
    });

    it("references symbol lookup without LSP throws (no heuristic fallback)", async () => {
      // No provider registered — whole-tool capability-unavailable → execute() throws.
      await expect(
        executeAction({ action: "graph", symbol: "Widget" }, { cwd: tmpDir }),
      ).rejects.toThrow("No analysis provider is available");
    });

    it("implementations symbol lookup without LSP throws (no heuristic fallback)", async () => {
      await expect(
        executeAction(
          { action: "graph", relations: ["implements"], symbol: "Widget" },
          { cwd: tmpDir },
        ),
      ).rejects.toThrow("No analysis provider is available");
    });
  });

  describe("brief action — no-result detail states", () => {
    it("returns details for no project model", async () => {
      const result = await executeContextTool({}, { cwd: tmpDir });
      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe("context");
      if (result.details?.type === "context") {
        expect(result.details.data.confidence).toBe("unavailable");
      }
    });

    it("returns structured inspect details for code_inspect", async () => {
      setupWorkspace();
      writeFileSync(path.join(tmpDir, "packages/core/index.ts"), "export const x = 1;\n");

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_inspect");

      const result = (await tool.execute(
        "details-inspect",
        { file: "packages/core/index.ts", line: 1, character: 14 },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        details?: {
          type: string;
          data?: { confidence?: string; nextQueries?: string[] };
        };
      };

      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe("inspect");
      if (result.details?.type === "inspect") {
        expect(result.details.data?.confidence).toBeDefined();
        expect(result.details.data?.nextQueries).toEqual(
          expect.arrayContaining([expect.stringContaining("code_graph")]),
        );
      }
    });

    it("impact target error returns impact details with unavailable confidence", async () => {
      const result = await executeAction({ action: "impact" }, { cwd: tmpDir });
      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe("impact");
      if (result.details?.type === "impact") {
        expect(result.details.data.confidence).toBe("unavailable");
        expect(result.details.data.directCount).toBe(0);
        expect(result.details.data.downstreamCount).toBe(0);
        expect(result.details.data.riskLevel).toBe("low");
      }
    });

    it("code_impact target error returns impact details with unavailable confidence and resolve-first guidance", async () => {
      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_impact");

      const result = (await tool.execute(
        "details-impact-error",
        {},
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        details?: {
          type: string;
          data: {
            confidence: string;
            directCount: number;
            downstreamCount: number;
            riskLevel: string;
            nextQueries: string[];
          };
        };
      };

      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe("impact");
      if (result.details?.type === "impact") {
        expect(result.details.data.confidence).toBe("unavailable");
        expect(result.details.data.directCount).toBe(0);
        expect(result.details.data.downstreamCount).toBe(0);
        expect(result.details.data.riskLevel).toBe("low");
        expect(result.details.data.nextQueries).toEqual(
          expect.arrayContaining([expect.stringContaining("code_resolve")]),
        );
      }
    });

    it("code_impact changedFiles input returns impact details with diff-aware next queries", async () => {
      setupWorkspace();
      writeFileSync(path.join(tmpDir, "packages/core/index.ts"), "export const changed = 1;\n");
      writeFileSync(
        path.join(tmpDir, "packages/core/index.test.ts"),
        "import { changed } from './index';\nvoid changed;\n",
      );

      const pi = createPiMock();
      codeIntelligenceExtension(pi as never);
      const tool = getTool(pi, "code_impact");

      const result = (await tool.execute(
        "details-impact-changed-files",
        {
          changedFiles: ["packages/core/index.ts"],
          includeTests: true,
        },
        undefined,
        undefined,
        makeCtx({ cwd: tmpDir }),
      )) as {
        details?: {
          type: string;
          data: {
            confidence: string;
            nextQueries: string[];
            likelyTests: string[];
          };
        };
      };

      expect(result.details).toBeDefined();
      expect(result.details?.type).toBe("impact");
      if (result.details?.type === "impact") {
        expect(result.details.data.confidence).not.toBe("unavailable");
        expect(result.details.data.likelyTests.length).toBeGreaterThan(0);
        expect(result.details.data.nextQueries).toEqual(
          expect.arrayContaining([expect.stringContaining("code_context")]),
        );
      }
    });

    describe("pattern action — no-result detail states", () => {
      it("returns details for regex error", async () => {
        const result = await executePatternAction({ pattern: "[invalid", regex: true }, tmpDir);
        expect(result.details).toBeDefined();
        expect(result.details?.type).toBe("search");
        if (result.details?.type === "search") {
          expect(result.details.data.confidence).toBe("unavailable");
          expect(result.details.data.candidateCount).toBe(0);
        }
      });

      it("returns details for zero matches", async () => {
        writeFileSync(path.join(tmpDir, "a.ts"), "const x = 1;");
        const result = await executePatternAction({ pattern: "nonexistent999" }, tmpDir);
        expect(result.details).toBeDefined();
        expect(result.details?.type).toBe("search");
        if (result.details?.type === "search") {
          expect(result.details.data.confidence).toBe("heuristic");
          expect(result.details.data.candidateCount).toBe(0);
        }
      });
    });

    describe("calls action — no-result detail states", () => {
      it("returns error for missing file param", async () => {
        const result = await executeAction(
          { action: "graph", relations: ["callees"] },
          { cwd: tmpDir },
        );
        expect(result.content).toContain("requires a target");
        expect(result.details).toBeDefined();
        expect(result.details?.type).toBe("search");
      });

      it("throws for callees on an unsupported file type when no provider is registered", async () => {
        writeFileSync(path.join(tmpDir, "notes.txt"), "some content\n");
        // No provider registered — whole-tool capability-unavailable → execute() throws.
        await expect(
          executeAction(
            { action: "graph", relations: ["callees"], file: "notes.txt", line: 1, character: 1 },
            { cwd: tmpDir },
          ),
        ).rejects.toThrow("No analysis provider is available");
      });

      it("returns details for a function with zero direct structural calls", async () => {
        writeFileSync(path.join(tmpDir, "empty.ts"), "function noCalls() { return 1; }\n");
        registerMockProvider(tmpDir, {
          calleesAt: async (_file, _line, _char) => ({
            kind: "success",
            data: {
              enclosingScope: { name: "noCalls", startLine: 1, endLine: 3 },
              callees: [],
              depth: "direct" as const,
            },
          }),
        });
        const result = await executeAction(
          { action: "graph", relations: ["callees"], file: "empty.ts", line: 1, character: 1 },
          { cwd: tmpDir },
        );
        expect(result.details).toBeDefined();
        expect(result.details?.type).toBe("search");
        if (result.details?.type === "search") {
          expect(result.details.data.confidence).toBe("structural");
          expect(result.details.data.candidateCount).toBe(0);
        }
      });
    });
  });
});

describe("code_context details metadata", () => {
  async function resolveTargetId(pi: ReturnType<typeof createPiMock>): Promise<string> {
    const resolveTool = getTool(pi, "code_resolve");
    const resolveResult = (await resolveTool.execute(
      "details-context-resolve",
      { file: "packages/core/index.ts", line: 1, character: 17 },
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

  it("returns dedicated context details for orientation-style output when task is omitted", async () => {
    setupWorkspace();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "details-context-project",
      {},
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: {
        type: string;
        data: {
          task: string | null;
          focusTarget: string | null;
          renderedSections: string[];
          requestedSections: string[];
          omittedCount: number;
          nextQueries: string[];
        };
      };
    };

    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("context");
    if (result.details?.type === "context") {
      expect(result.details.data.task).toBeNull();
      expect(result.details.data.focusTarget).toBeNull();
      expect(result.details.data.renderedSections.length).toBeGreaterThan(0);
      expect(result.details.data.requestedSections).toEqual([]);
      expect(result.details.data.omittedCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("falls back to orientation for defs-only task context without a precise target", async () => {
    setupWorkspace();

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "details-context-no-target-defs",
      {
        task: "understand the surrounding definitions",
        include: ["defs"],
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: {
        type: string;
        data: {
          confidence: string;
          task: string | null;
          focusTarget: string | null;
          renderedSections: string[];
          requestedSections: string[];
          omittedCount: number;
          nextQueries: string[];
        };
      };
    };

    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("context");
    if (result.details?.type === "context") {
      // Model is now always built, so confidence is structural even for task fallback
      expect(result.details.data.confidence).toBe("structural");
      // Orientation mode has different section semantics
      expect(result.details.data.renderedSections).toContain("orientation");
    }
  });

  it("returns dedicated context details for a targeted task bundle", async () => {
    setupWorkspace();
    writeFileSync(
      path.join(tmpDir, "packages/core/index.ts"),
      ["export function targetFn() { helper(); }", "export function helper() { return 1; }"]
        .join("\n")
        .concat("\n"),
    );

    registerMockProvider(tmpDir, {
      references: async () => [
        {
          uri: `file://${path.join(tmpDir, "packages/app/main.ts")}`,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 8 },
          },
        },
      ],
      calleesAt: async () => ({
        kind: "success",
        data: {
          enclosingScope: { name: "targetFn", startLine: 1, endLine: 1 },
          callees: [{ name: "helper", startLine: 1, endLine: 1 }],
          depth: "direct" as const,
        },
      }),
    });

    const pi = createPiMock();
    codeIntelligenceExtension(pi as never);
    const targetId = await resolveTargetId(pi);
    const tool = getTool(pi, "code_context");

    const result = (await tool.execute(
      "details-context-targeted",
      {
        task: "rename targetFn safely",
        targetId,
        include: ["defs", "references", "callees"],
        maxResults: 2,
      },
      undefined,
      undefined,
      makeCtx({ cwd: tmpDir }),
    )) as {
      details?: {
        type: string;
        data: {
          task: string | null;
          focusTarget: string | null;
          renderedSections: string[];
          requestedSections: string[];
          omittedCount: number;
          nextQueries: string[];
          evidenceLists?: Array<{
            key: string;
            totalCount: number | null;
            shownCount: number;
            omittedCount: number | null;
            partialReason: string | null;
          }>;
        };
      };
    };

    expect(result.details).toBeDefined();
    expect(result.details?.type).toBe("context");
    if (result.details?.type === "context") {
      expect(result.details.data.task).toBe("rename targetFn safely");
      expect(result.details.data.focusTarget).not.toBeNull();
      expect(result.details.data.requestedSections).toEqual(["defs", "references", "callees"]);
      expect(result.details.data.renderedSections).toEqual(
        expect.arrayContaining(["defs", "references", "callees"]),
      );
      expect(result.details.data.nextQueries.length).toBeGreaterThan(0);
      expect(result.details.data.evidenceLists).toContainEqual({
        key: "callees.calls",
        totalCount: 1,
        shownCount: 1,
        omittedCount: 0,
        partialReason: null,
      });
    }
  });
});
